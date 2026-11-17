// The browser the tests drive. By default it is the Chromium that Playwright installs. Set CHROME_PATH to the program of another Chrome (for example
// one of Google's "Chrome for Testing" builds, any version) and every test launches that one instead: that is how the suite is run against the
// oldest Chrome the extension claims to support, and against the newest (see .github/workflows/chrome-versions.yml).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const real = createRequire(path.join(root, "package.json"))("playwright").chromium;
const executable = process.env.CHROME_PATH || "";

export const chromium = executable
  ? new Proxy(real, {
      get(target, name) {
        if (name === "launchPersistentContext") return (dir, options = {}) => target.launchPersistentContext(dir, { executablePath: executable, ...options });
        if (name === "launch") return (options = {}) => target.launch({ executablePath: executable, ...options });
        const value = target[name];
        return typeof value === "function" ? value.bind(target) : value;
      },
    })
  : real;
export const browserName = executable ? `Chrome at ${executable}` : "Playwright's Chromium";
