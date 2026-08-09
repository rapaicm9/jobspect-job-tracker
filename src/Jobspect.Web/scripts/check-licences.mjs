import { spawnSync } from "node:child_process";

// Permissive licences that need no further thought: attribution at most, no
// obligation that reaches the code importing them.
const ALLOWED = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "ISC",
  "MIT",
  "Unlicense",
  // Geist is vendored as a .woff2 with its OFL text beside it, so pnpm never
  // sees it. Listed so that packaging the typeface later is not a gate failure.
  "OFL-1.1",
]);

// Anything outside ALLOWED has to be named here with the reason it is tolerated.
// A new copyleft dependency therefore fails the build instead of arriving quietly.
const EXCEPTIONS = [
  {
    match: /^@img\/sharp-/,
    reason:
      "Optional native binary Next pulls in for image optimization; dynamically linked, never bundled, and this app does not call sharp.",
  },
  {
    match: /^(@axe-core\/playwright|axe-core)$/,
    reason:
      "MPL-2.0 is per-file copyleft and these run only in the test suite. Nothing links them into the app.",
  },
  {
    match: /^lightningcss/,
    reason:
      "MPL-2.0, build-time CSS toolchain behind Tailwind. Output is our own stylesheet, not a derivative of the compiler.",
  },
  {
    match: /^caniuse-lite$/,
    reason: "CC-BY-4.0 browser support data, consumed at build time.",
  },
  {
    match: /^argparse$/,
    reason: "Python-2.0 licensed JS port; permissive, unusual SPDX id only.",
  },
];

function readLicences() {
  // One command string rather than an args array: pnpm is a shim on Windows so
  // it needs a shell, and Node deprecates combining a shell with separate args.
  const result = spawnSync("pnpm licenses list --json", {
    encoding: "utf8",
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });

  const stdout = result.stdout?.trim();

  // pnpm can exit non-zero while still having produced the report, so the
  // presence of parseable output decides rather than the exit code.
  if (!stdout) {
    console.error("Could not read the licence report from pnpm.");
    if (result.stderr) console.error(result.stderr);
    process.exit(1);
  }

  try {
    return JSON.parse(stdout);
  } catch {
    console.error("pnpm returned a licence report that is not valid JSON.");
    process.exit(1);
  }
}

const report = readLicences();
const violations = [];
const excepted = [];

for (const [licence, packages] of Object.entries(report)) {
  if (ALLOWED.has(licence)) continue;

  for (const pkg of packages) {
    const exception = EXCEPTIONS.find((candidate) => candidate.match.test(pkg.name));

    if (exception) {
      excepted.push({ name: pkg.name, licence, reason: exception.reason });
    } else {
      violations.push({ name: pkg.name, licence });
    }
  }
}

if (excepted.length > 0) {
  console.log(`Reviewed exceptions (${excepted.length}):`);
  for (const { name, licence, reason } of excepted) {
    console.log(`  ${name} — ${licence}`);
    console.log(`    ${reason}`);
  }
  console.log("");
}

if (violations.length > 0) {
  console.error(`Unreviewed licences (${violations.length}):`);
  for (const { name, licence } of violations) {
    console.error(`  ${name} — ${licence}`);
  }
  console.error(
    "\nEither the dependency goes, or it gets an entry in EXCEPTIONS in this file stating why it is acceptable.",
  );
  process.exit(1);
}

console.log(
  `Licence check passed: every dependency is permissive or reviewed (${excepted.length} exception${excepted.length === 1 ? "" : "s"}).`,
);
