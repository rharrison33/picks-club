import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { openDatabase, type Database } from "./database.js";

export const importTables = [
  "users",
  "sessions",
  "pools",
  "memberships",
  "pool_weeks",
  "picks",
  "pick_audit",
  "game_results",
  "email_tokens",
  "verified_emails",
  "age_acknowledgments",
  "sms_preferences",
  "sms_outbox",
  "sms_final_events",
];
export async function importSqlite(source: DatabaseSync, target: Database) {
  const counts: Record<string, number> = {};
  source.exec("BEGIN");
  try {
    await target.transaction(async () => {
      for (const table of importTables) {
        if (
          (await target.prepare(`SELECT count(*) AS count FROM ${table}`).get())
            .count !== 0
        )
          throw new Error(
            "Import requires an empty destination. Existing Postgres data was not overwritten.",
          );
      }
      for (const table of importTables) {
        const rows = source.prepare(`SELECT * FROM ${table}`).all();
        for (const row of rows) {
          const columns = Object.keys(row);
          if (!columns.every((name) => /^[a-z_]+$/.test(name)))
            throw new Error("Unexpected source column.");
          await target
            .prepare(
              `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
            )
            .run(...Object.values(row));
        }
        counts[table] = rows.length;
        if (
          (await target.prepare(`SELECT count(*) AS count FROM ${table}`).get())
            .count !== rows.length
        )
          throw new Error("Row-count verification failed.");
      }
      for (const table of ["pick_audit", "sms_outbox"]) {
        await target.exec(
          `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id),1), MAX(id) IS NOT NULL) FROM ${table}`,
        );
      }
    });
  } finally {
    source.exec("ROLLBACK");
  }
  return counts;
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const sourcePath =
    process.argv[2] ??
    fileURLToPath(new URL("../.data/picks-club.sqlite", import.meta.url));
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const target = await openDatabase();
  try {
    const counts = await importSqlite(source, target);
    console.log("Imported and verified row counts:", counts);
  } finally {
    source.close();
    await target.close();
  }
}
