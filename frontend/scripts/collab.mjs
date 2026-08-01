/** Start the local y-sweet collaboration server.
 *
 * Two Windows problems this works around, both of which cost real time:
 *
 * 1. The published binary is named `y-sweet`, with no extension. PowerShell
 *    decides how to run a file from its extension, so invoking it by path opens
 *    the "how do you want to open this file?" dialog instead of running it. A
 *    copy named `.exe` runs correctly, and is made here if missing — in
 *    node_modules, so `npm install` wipes it and this recreates it.
 *
 * 2. The package's own `bin` wrapper spawns the binary through Node and exits
 *    immediately in some shells, serving nothing and reporting success. This
 *    spawns the binary directly instead.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = join(frontend, "node_modules", "y-sweet", "bin", "y-sweet");

if (!existsSync(base)) {
  console.error(
    "y-sweet is not installed. Run `npm install` in frontend/ and try again.",
  );
  process.exit(1);
}

let binary = base;
if (process.platform === "win32") {
  binary = `${base}.exe`;
  if (!existsSync(binary)) copyFileSync(base, binary);
}

// Outside the repo's tracked files, and gitignored: this is a local cache of
// in-progress edits, not something to share.
const store = join(frontend, "..", ".ysweet-data");
const port = process.env.PORT ?? "8080";

console.log(`y-sweet serving ${store} on port ${port}`);
console.log(
  `Set Y_SWEET_CONNECTION_STRING=ys://127.0.0.1:${port} in backend/.env, then restart the backend.`,
);
console.log("Use 127.0.0.1, not localhost — localhost costs ~2s per call on Windows.\n");

const child = spawn(binary, ["serve", store, "--port", port], {
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
