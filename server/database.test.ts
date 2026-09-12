import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { openDatabase } from "./database.js";
import { importSqlite } from "./import-sqlite.js";

test("SQLite import preserves data, restores sequences and refuses overwriting", async () => {
  const source = new DatabaseSync(":memory:");
  const db = await openDatabase(":memory:");
  try {
    source.exec(
      await readFile(
        new URL("./fixtures/legacy-sqlite.sql", import.meta.url),
        "utf8",
      ),
    );
    source
      .prepare(
        "INSERT INTO users(id,email,name,state,password_hash,favorites_json) VALUES (?,?,?,?,?,?)",
      )
      .run(
        "alice",
        "alice@example.test",
        "Alice",
        "",
        "test-hash",
        '["Colorado"]',
      );
    source
      .prepare(
        "INSERT INTO pools(id,name,invite_code,timezone,default_fee_cents) VALUES (?,?,?,?,?)",
      )
      .run("pool", "My pool", "fixture-code", "America/Denver", 2500);
    source
      .prepare("INSERT INTO memberships(pool_id,user_id,role) VALUES (?,?,?)")
      .run("pool", "alice", "organizer");
    source
      .prepare("INSERT INTO pick_audit VALUES (?,?,?,?,?,?,?)")
      .run(50, "pool", "2026-09-19", "alice", 1, "home", 1789000000000);
    const counts = await importSqlite(source, db);
    assert.equal(counts.users, 1);
    assert.equal(
      (
        await db
          .prepare("SELECT favorites_json FROM users WHERE id=?")
          .get("alice")
      ).favorites_json,
      '["Colorado"]',
    );
    await db
      .prepare(
        "INSERT INTO pick_audit(pool_id,saturday,user_id,game_id,side,saved_at) VALUES (?,?,?,?,?,?)",
      )
      .run("pool", "2026-09-19", "alice", 2, "away", 1789000000001);
    assert.equal(
      (await db.prepare("SELECT max(id) AS id FROM pick_audit").get()).id,
      51,
    );
    await assert.rejects(importSqlite(source, db), /empty destination/);
    assert.equal(
      source.prepare("SELECT count(*) AS count FROM users").get()!.count,
      1,
    );
  } finally {
    source.close();
    await db.close();
  }
});

test("failed import rolls back and concurrent transactions preserve writes", async () => {
  const source = new DatabaseSync(":memory:");
  const db = await openDatabase(":memory:");
  try {
    source.exec(
      await readFile(
        new URL("./fixtures/legacy-sqlite.sql", import.meta.url),
        "utf8",
      ),
    );
    source
      .prepare(
        "INSERT INTO users(id,email,name,state,password_hash) VALUES (?,?,?,?,?)",
      )
      .run("alice", "alice@example.test", "Alice", "", "test-hash");
    source.exec("PRAGMA foreign_keys=OFF"); // Deliberately corrupt source: destination must reject and roll back.
    source
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run("token", "missing-user", 1789000000000);
    await assert.rejects(importSqlite(source, db));
    assert.equal(
      (await db.prepare("SELECT count(*) AS count FROM users").get()).count,
      0,
    );
    await db.exec(
      "CREATE TABLE test_counter(value INTEGER NOT NULL); INSERT INTO test_counter VALUES (0)",
    );
    await Promise.all(
      Array.from({ length: 8 }, () =>
        db.transaction(async () => {
          const current = await db
            .prepare("SELECT value FROM test_counter")
            .get();
          await db
            .prepare("UPDATE test_counter SET value=?")
            .run(current.value + 1);
        }),
      ),
    );
    assert.equal(
      (await db.prepare("SELECT value FROM test_counter").get()).value,
      8,
    );
    await assert.rejects(
      db.transaction(async () => {
        await db.exec("UPDATE test_counter SET value=100");
        throw new Error("rollback");
      }),
    );
    assert.equal(
      (await db.prepare("SELECT value FROM test_counter").get()).value,
      8,
    );
  } finally {
    source.close();
    await db.close();
  }
});
