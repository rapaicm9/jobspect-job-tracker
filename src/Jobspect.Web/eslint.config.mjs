import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

// App Router reserved filenames. Anything else under src/app is colocated
// application code, which belongs in a feature slice where it can be reused and
// tested without a route around it.
const ROUTE_FILES = new Set([
  "page",
  "layout",
  "template",
  "loading",
  "error",
  "global-error",
  "not-found",
  "forbidden",
  "unauthorized",
  "route",
  "default",
  "sitemap",
  "robots",
  "manifest",
  "icon",
  "apple-icon",
  "opengraph-image",
  "twitter-image",
]);

const localRules = {
  rules: {
    "server-only-import": {
      meta: {
        type: "problem",
        docs: {
          description: "Require `import 'server-only'` in every module under src/server.",
        },
        schema: [],
        messages: {
          missing:
            "Add `import 'server-only';` at the top of this file. Without it a bad import chain pulls this module, and whatever token or Redis handle it closes over, into a client bundle.",
        },
      },
      create(context) {
        return {
          Program(node) {
            const imported = node.body.some(
              (statement) =>
                statement.type === "ImportDeclaration" && statement.source.value === "server-only",
            );

            if (!imported) {
              context.report({ node, messageId: "missing" });
            }
          },
        };
      },
    },

    "route-files-only": {
      meta: {
        type: "problem",
        docs: {
          description: "Allow only App Router reserved filenames under src/app.",
        },
        schema: [],
        messages: {
          notARouteFile:
            "`{{ basename }}` is not an App Router file. src/app holds routes; move this into a feature slice under src/features and import it from the route.",
        },
      },
      create(context) {
        return {
          Program(node) {
            const filename = context.filename.replace(/\\/g, "/");
            const basename = filename.slice(filename.lastIndexOf("/") + 1);
            const stem = basename.replace(/\.(ts|tsx|js|jsx|mjs)$/, "");

            if (!ROUTE_FILES.has(stem)) {
              context.report({
                node,
                messageId: "notARouteFile",
                data: { basename },
              });
            }
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // openapi-typescript owns this file; it is regenerated, never edited.
    "src/server/api/schema.d.ts",
  ]),

  {
    plugins: { boundaries, local: localRules },

    settings: {
      // partialMatch:false anchors each pattern at the project root. The default
      // matches any path *ending* in the pattern, which would make a stray
      // "ui" folder inside a feature register as the design system.
      "boundaries/elements": [
        { type: "app", pattern: "src/app", partialMatch: false },
        {
          type: "feature",
          pattern: "src/features/*",
          capture: ["slice"],
          partialMatch: false,
        },
        { type: "server", pattern: "src/server", partialMatch: false },
        { type: "ui", pattern: "src/ui", partialMatch: false },
        { type: "lib", pattern: "src/lib", partialMatch: false },
      ],
      "boundaries/ignore": ["e2e/**", "scripts/**", "*.config.*"],
    },

    rules: {
      // Policies are last-match-wins, so each disallow is followed by the
      // narrower allows that carve out its exceptions.
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: { element: { type: "ui" } },
              disallow: {
                to: { element: { types: { anyOf: ["feature", "server"] } } },
              },
              message:
                "src/ui is the design system: it takes props, not data. Importing a feature or a server module here makes a primitive unusable outside the one feature it grew up in.",
            },

            {
              from: { element: { type: "feature" } },
              disallow: { to: { element: { type: "feature" } } },
              message:
                "Reach another slice through its index.ts. Importing its internals couples you to a layout that is free to change.",
            },
            {
              from: { element: { type: "feature" } },
              allow: {
                to: {
                  element: {
                    type: "feature",
                    captured: { slice: "{{ from.element.captured.slice }}" },
                  },
                },
              },
            },
            {
              from: { element: { type: "feature" } },
              allow: {
                to: {
                  element: { type: "feature", fileInternalPath: "index.ts" },
                },
              },
            },

            {
              from: { element: { type: "*" } },
              disallow: {
                to: {
                  element: {
                    type: "server",
                    fileInternalPath: "api/schema.d.ts",
                  },
                },
              },
              message:
                "Generated contract types stay behind src/server/api. Features consume view models, so a contract change lands in one folder instead of every screen.",
            },
            {
              from: {
                element: { type: "server", fileInternalPath: "api/**" },
              },
              allow: {
                to: {
                  element: {
                    type: "server",
                    fileInternalPath: "api/schema.d.ts",
                  },
                },
              },
            },
          ],
        },
      ],
    },
  },

  {
    files: ["src/server/**/*.ts", "src/server/**/*.tsx"],
    ignores: ["src/server/**/*.d.ts"],
    rules: { "local/server-only-import": "error" },
  },

  {
    files: ["src/app/**/*.ts", "src/app/**/*.tsx"],
    rules: { "local/route-files-only": "error" },
  },
]);

export default eslintConfig;
