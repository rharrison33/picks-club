import { backup, DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const source = process.env.DB_PATH ?? fileURLToPath(new URL("../.data/picks-club.sqlite", import.meta.url));
if (!existsSync(source)) throw new Error("Source database does not exist.");
const destination = resolve(process.argv[2] ?? fileURLToPath(new URL("../.data/backups/" + Date.now() + ".sqlite", import.meta.url)));
if (resolve(source) === destination) throw new Error("Backup must use a different path.");
if (existsSync(destination)) throw new Error("Choose a new backup filename.");
mkdirSync(dirname(destination), { recursive:true });
const db = new DatabaseSync(source);
try { await backup(db, destination); } finally { db.close(); }
const copy = new DatabaseSync(destination, { readOnly:true });
try {
  const result = copy.prepare("PRAGMA integrity_check").get();
  if (result?.integrity_check !== "ok") throw new Error("Backup integrity check failed.");
  if (copy.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Backup foreign key check failed.");
} finally { copy.close(); }
console.log("Verified database backup created at " + destination);
