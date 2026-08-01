import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const child = spawn(process.execPath, ["src/yetibot.js"], {
  cwd: projectRoot,
  env: process.env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const deadline = Date.now() + 45_000;
let readyPayload;

try {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    if (stdout.includes("ONLINE:")) {
      const response = await fetch("http://127.0.0.1:3000/ready");
      if (response.ok) {
        readyPayload = await response.json();
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (!readyPayload) {
    throw new Error("The bot did not become ready within 45 seconds.");
  }

  console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  console.log(`Live smoke check passed: ${JSON.stringify(readyPayload)}`);
} finally {
  if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
