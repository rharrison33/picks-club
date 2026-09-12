import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pgTool, runTool } from "./pg-tools.js";
const path = fileURLToPath(new URL("../.data/postgres", import.meta.url));
const versionFile = path + "/PG_VERSION";
if (!existsSync(versionFile))
  throw new Error(
    "No local Postgres cluster exists. Create a database using the setup in DATABASE.md, or set DATABASE_URL to your hosted Postgres database.",
  );
const ctl = pgTool("pg_ctl", readFileSync(versionFile, "utf8").trim());
try {
  await runTool(ctl, ["status", "-D", path]);
  console.log("Local Postgres is already running.");
} catch {
  await runTool(ctl, [
    "start",
    "-D",
    path,
    "-l",
    fileURLToPath(new URL("../.data/postgres.log", import.meta.url)),
    "-o",
    "-h 127.0.0.1 -p 55432",
    "-w",
  ]);
  console.log("Local Postgres started on 127.0.0.1:55432.");
}
