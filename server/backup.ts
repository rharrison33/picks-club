import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pgTool, runTool } from "./pg-tools.js";

if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL before taking a backup.");
const destination = resolve(
  process.argv[2] ??
    fileURLToPath(
      new URL(
        "../.data/postgres-backups/" + Date.now() + ".dump",
        import.meta.url,
      ),
    ),
);
if (existsSync(destination)) throw new Error("Choose a new backup filename.");
mkdirSync(dirname(destination), { recursive: true });
// Keep the connection URL out of process arguments and logs.
const url = new URL(process.env.DATABASE_URL);
await runTool(
  pgTool("pg_dump"),
  [
    "--no-password",
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--file",
    destination,
  ],
  {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get("sslmode") ?? "prefer",
    PGCONNECT_TIMEOUT: "10",
  },
);
await runTool(pgTool("pg_restore"), ["--list", destination]);
console.log("Postgres backup created and archive checked: " + destination);
console.log(
  "Restore into a separate database to verify recovery before launch.",
);
