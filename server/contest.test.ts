import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { openDatabase } from "./database.js";
import { tokenHash } from "./auth.js";
import { addContestRoutes } from "./contest.js";
import { addRecoveryRoutes } from "./recovery.js";

test("pick deadlines, private choices, scoring corrections, and single-use recovery", async () => {
  const db = openDatabase(":memory:");
  const saturday = "2099-01-03", kickoff = Date.parse(saturday + "T18:00:00Z");
  let clock = kickoff - 1, failedFeed = false, homePoints = 21;
  for (const id of ["alice","bob"]) {
    db.prepare("INSERT INTO users(id,email,name,state,password_hash) VALUES (?,?,?,?,?)").run(id, id + "@example.test", id, "CO", "unused");
    db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(tokenHash(id), id, Date.now() + 3600000);
  }
  db.prepare("INSERT INTO pools(id,name,invite_code,timezone,default_fee_cents) VALUES ('pool','Test','code','America/Denver',0)").run();
  for (const id of ["alice","bob"]) db.prepare("INSERT INTO memberships(pool_id,user_id,role) VALUES ('pool',?,'player')").run(id);
  const games = [1,2].map((id) => ({ id, homeTeam:"Home",awayTeam:"Away",startDate:new Date(kickoff).toISOString() }));
  db.prepare("INSERT INTO pool_weeks(pool_id,saturday,fee_cents,games_json,published) VALUES ('pool',?,0,?,1)").run(saturday, JSON.stringify(games));
  const app = express(); app.use(express.json());
  addContestRoutes(app, db, async () => { if (failedFeed) throw new Error("offline"); return [{ id:1, completed:true, homePoints, awayPoints:14 },{ id:2, completed:true,homePoints:7,awayPoints:7 }]; }, () => clock);
  let mailed = "";
  addRecoveryRoutes(app, db, async (_email, _purpose, token) => { mailed = token; });
  const server = app.listen(0,"127.0.0.1"); await once(server,"listening");
  const addr = server.address(); assert(addr && typeof addr !== "string");
  const port = addr.port;
  async function request(path:string, who="alice", method="GET", body?:unknown, status=200) {
    const response = await fetch("http://127.0.0.1:" + port + path, {method, headers:{"Content-Type":"application/json",Cookie:"picks_session="+who}, ...(body ? {body:JSON.stringify(body)} : {})});
    const result = await response.json(); assert.equal(response.status,status,JSON.stringify(result)); return result;
  }
  const base="/api/pools/pool/weeks/"+saturday;
  try {
    await request(base+"/picks","alice","PUT",{gameId:1,side:"home"});
    await request(base+"/picks","alice","PUT",{gameId:2,side:"away"});
    await request(base+"/picks","bob","PUT",{gameId:1,side:"away"});
    const before = await request(base+"/contest","bob");
    assert.equal(before.standings.find((r:any)=>r.id==="alice").picks.length,0);
    clock=kickoff;
    await request(base+"/picks","alice","PUT",{gameId:1,side:"away"},409);
    const after = await request(base+"/contest","bob");
    assert.equal(after.standings.find((r:any)=>r.id==="alice").score,1);
    assert.equal(after.standings.find((r:any)=>r.id==="alice").picks.length,2);
    homePoints=7;
    assert.equal((await request(base+"/contest","bob")).standings.find((r:any)=>r.id==="bob").score,1);
    failedFeed=true;
    const stale=await request(base+"/contest","bob");
    assert.equal(stale.feedUnavailable,true); assert.equal(stale.standings[0].score,1);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM pick_audit").get() as {n:number}).n,3);
    await request("/api/auth/forgot-password","alice","POST",{email:"alice@example.test"});
    assert.equal(mailed.length,64);
    const reset={token:mailed,purpose:"reset",password:"replacement-password-123"};
    await request("/api/auth/complete-email","alice","POST",reset);
    await request("/api/auth/complete-email","alice","POST",reset,400);
    await request(base+"/contest","alice","GET",undefined,401);
    await request("/api/auth/request-verification","bob","POST",{});
    await request("/api/auth/complete-email","bob","POST",{token:mailed,purpose:"verify"});
    assert(db.prepare("SELECT 1 FROM verified_emails WHERE user_id='bob'").get());
    await request("/api/auth/complete-email","bob","POST",{token:mailed,purpose:"verify"},400);
  } finally {server.closeAllConnections(); await new Promise<void>((resolve)=>server.close(()=>resolve()));db.close();}
});
