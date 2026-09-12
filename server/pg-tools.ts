import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

export function pgTool(name: string, major?: string) {
  const executable = name + (process.platform === "win32" ? ".exe" : "");
  if (process.env.PG_BIN) return join(process.env.PG_BIN, executable);
  const root = "C:/Program Files/PostgreSQL";
  if (process.platform === "win32" && existsSync(root)) {
    const versions = major
      ? [major]
      : readdirSync(root).sort((a, b) => Number(b) - Number(a));
    for (const version of versions) {
      const path = join(root, version, "bin", executable);
      if (existsSync(path)) return path;
    }
  }
  return executable;
}
export function runTool(command: string, args: string[], env = process.env) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      windowsHide: true,
      stdio: "ignore",
    });
    child.on("error", () =>
      reject(
        new Error(
          "Postgres utility could not start. Install Postgres client tools or set PG_BIN.",
        ),
      ),
    );
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Postgres utility failed (exit ${code}). Check server connection and tool version.`,
            ),
          ),
    );
  });
}
