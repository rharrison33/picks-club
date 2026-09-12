import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { openDatabase } from "./database.js";
import { tokenHash } from "./auth.js";
import {
  addSmsRoutes,
  pollSaturdayUpdates,
  stopSms,
  type SmsProvider,
} from "./sms.js";
test("SMS requires consent and verification; final alerts deduplicate and STOP cancels", async () => {
  const db = await openDatabase(":memory:");
  for (const id of ["member", "unverified"]) {
    await db
      .prepare(
        "INSERT INTO users(id,email,name,state,password_hash) VALUES (?,?,?,?,?)",
      )
      .run(id, id + "@example.test", id, "", "unused");
    await db
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(tokenHash(id), id, Date.now() + 3600000);
  }
  await db
    .prepare(
      "INSERT INTO pools(id,name,invite_code,timezone,default_fee_cents) VALUES ('p','Test','invite','America/Denver',1000)",
    )
    .run();
  for (const id of ["member", "unverified"])
    await db
      .prepare(
        "INSERT INTO memberships(pool_id,user_id,role) VALUES ('p',?,'player')",
      )
      .run(id);
  const saturday = "2099-01-03",
    now = Date.parse(saturday + "T22:00:00Z");
  await db
    .prepare(
      "INSERT INTO pool_weeks(pool_id,saturday,fee_cents,games_json,published) VALUES ('p',?,1000,?,1)",
    )
    .run(
      saturday,
      JSON.stringify([
        { id: 1, startDate: saturday + "T18:00:00Z" },
        { id: 2, startDate: saturday + "T18:00:00Z" },
      ]),
    );
  const sent: string[] = [];
  const provider: SmsProvider = {
    startVerification: async () => "challenge",
    checkVerification: async (_id, code) => code === "123456",
    send: async (phone, body) => {
      sent.push(phone + " " + body);
      return { id: "test-message" };
    },
  };
  const app = express();
  app.use(express.json());
  addSmsRoutes(app, db, provider);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const port = address.port;
  async function req(
    path: string,
    body: unknown,
    status = 200,
    who = "member",
    method = "POST",
  ) {
    const r = await fetch("http://127.0.0.1:" + port + "/api/auth/sms" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: "picks_session=" + who,
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    assert.equal(r.status, status, JSON.stringify(data));
    return data;
  }
  const oldOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://picks-club.com";
  try {
    await req(
      "",
      { optedIn: true, phone: "+13035550123", consent: false },
      400,
      "member",
      "PUT",
    );
    await req(
      "",
      { optedIn: true, phone: "+13035550123", consent: true },
      200,
      "member",
      "PUT",
    );
    await req(
      "",
      { optedIn: true, phone: "+13035550124", consent: true },
      200,
      "unverified",
      "PUT",
    );
    await req("/confirm", { code: "123456" }, 400);
    await req("/verify", {});
    await req("/confirm", { code: "999999" }, 400);
    await req("/confirm", { code: "123456" });
    const results = async () => [
      { id: 1, completed: true, homePoints: 21, awayPoints: 14 },
    ];
    await pollSaturdayUpdates(db, provider, results, now);
    await pollSaturdayUpdates(db, provider, results, now + 1000);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /pool=p/);
    assert.match(sent[0], /week=2099-01-03/);
    assert.match(sent[0], /#standings/);
    await stopSms(db, "+13035550123");
    await pollSaturdayUpdates(
      db,
      provider,
      async () => [
        ...(await results()),
        { id: 2, completed: true, homePoints: 7, awayPoints: 0 },
      ],
      now + 2000,
    );
    assert.equal(sent.length, 1);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT opted_in FROM sms_preferences WHERE user_id='member'",
          )
          .get()
      )?.opted_in,
      0,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT completed FROM game_results WHERE game_id=2")
          .get()
      )?.completed,
      1,
    );
  } finally {
    if (oldOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = oldOrigin;
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await db.close();
  }
});
