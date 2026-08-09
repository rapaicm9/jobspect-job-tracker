import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // Tests live outside src/ so that src/ stays shipped code. It also keeps
    // them clear of the lint rule requiring `import 'server-only'` on every
    // file under src/server/, which a test file has no business carrying.
    include: ["test/**/*.test.{ts,tsx}"],
    // Node by default: everything here exercises server modules. A component
    // test opts itself into jsdom with a `@vitest-environment jsdom` docblock,
    // which is what replaced the removed environmentMatchGlobs option.
    environment: "node",
    env: {
      // client.ts refuses to load without this, on the grounds that a silently
      // unset base URL is worse than a loud one.
      JOBSPECT_API_BASE_URL: "http://api.test",
    },
  },
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
      // `server-only` throws unless it is resolved through the `react-server`
      // export condition, and every module under src/server/ imports it. Setting
      // that condition globally would also hand Vitest React's react-server
      // build, which Testing Library cannot render, so the package is stubbed
      // here instead - narrower, and it fails in the one place we understand.
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
      },
    ],
  },
});
