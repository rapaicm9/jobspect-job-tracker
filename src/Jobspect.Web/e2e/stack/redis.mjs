// Runs the Redis the authenticated suite stores its sessions in.
//
// A wrapper rather than a bare `docker run` in the config, for one reason:
// Playwright ends a web server by killing its process tree, which takes the
// docker client with it and leaves the daemon holding the container - so the
// next run would collide on the fixed port and the container name. Removing it
// on the way *in* is the only removal guaranteed to run, which makes starting
// idempotent no matter how the last run ended.
//
// The handlers below cover an interrupted run, which is the one exit that does
// deliver a signal. `gracefulShutdown` in the Playwright config was tried and
// measured: on Windows the container outlives the run either way, so it is not
// configured.
//
// Everything is passed in rather than hard-coded so the numbers live in
// e2e/stack/ports.ts alone.

import { spawn, spawnSync } from "node:child_process";

const name = process.env.REDIS_CONTAINER ?? "jobspect-web-e2e-redis";
const port = process.env.REDIS_PORT ?? "6390";
const image = process.env.REDIS_IMAGE ?? "redis:8.2";

function removeContainer() {
  spawnSync("docker", ["rm", "--force", name], { stdio: "ignore" });
}

removeContainer();

const container = spawn(
  "docker",
  ["run", "--rm", "--name", name, "--publish", `127.0.0.1:${port}:6379`, image],
  // Inherited so the readiness line Redis prints reaches Playwright, which is
  // watching this process's stdout for it.
  { stdio: "inherit" },
);

container.on("exit", (code) => process.exit(code ?? 0));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    removeContainer();
    process.exit(0);
  });
}
