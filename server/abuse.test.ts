import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { requestLimit, concurrentRequests } from "./abuse.js";
import { openDatabase } from "./database.js";
import { reserveUsage } from "./usage.js";

test("rate limits stop requests before body parsing, send retry headers and expire", async () => {
  const app = express();
  app.use(requestLimit(2, 1000));
  app.use(express.json());
  app.post("/", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const request = (body = "{}") =>
    fetch(`http://127.0.0.1:${address.port}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  try {
    assert.equal((await request()).status, 200);
    assert.equal((await request()).status, 200);
    const blocked = await request("invalid-json");
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get("Retry-After"));
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal((await request()).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("overload rejects excess work and releases capacity after completion", async () => {
  const app = express();
  app.use(concurrentRequests(1));
  let complete!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  app.get("/slow", (_req, res) => {
    complete = () => res.end("done");
    entered();
  });
  app.get("/", (_req, res) => res.end("ok"));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const slow = fetch(base + "/slow");
    await ready;
    assert.equal((await fetch(base)).status, 503);
    complete();
    await slow;
    assert.equal((await fetch(base)).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("provider budgets are atomic, persist in the database and roll back partial reservations", async () => {
  const db = await openDatabase(":memory:");
  const period = new Date().toISOString().slice(0, 10);
  try {
    const limits = [{ scope: "email", period, limit: 3 }];
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => reserveUsage(db, limits)),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
    await assert.rejects(
      reserveUsage(db, [{ scope: "other", period, limit: 9 }, ...limits]),
    );
    assert.equal(
      await db
        .prepare("SELECT 1 FROM outbound_usage WHERE scope='other'")
        .get(),
      undefined,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT used FROM outbound_usage WHERE scope='email'")
          .get()
      ).used,
      3,
    );
  } finally {
    await db.close();
  }
});
