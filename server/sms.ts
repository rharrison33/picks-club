import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import { requireUser, authLimiter, type User } from "./auth.js";
import { transaction } from "./database.js";
import { getResults } from "./sports.js";

// A delivery adapter must be supplied only after a provider accepts this use case.
// There is intentionally no default transport and no Twilio integration.
export interface SmsProvider {
  startVerification(phone: string): Promise<string>;
  checkVerification(challenge: string, code: string): Promise<boolean>;
  send(phone: string, body: string): Promise<{ id: string }>;
}
export const SMS_CONSENT = "I agree to automated Picks Club SMS with standings links after selected games finish on Saturdays (up to 8 messages per pool per Saturday). Message and data rates may apply. Reply STOP to unsubscribe or HELP for help. Consent is optional and is not a condition of purchase.";
type Preference = { user_id:string; phone:string; opted_in:number; consent_at:number; verified:number; challenge:string|null; challenge_expires:number|null };
export function addSmsRoutes(app: Express, db: DatabaseSync, provider?: SmsProvider) {
  const auth = requireUser(db), limiter = authLimiter();
  app.get("/api/auth/sms", auth, (_req,res) => {
    const p = db.prepare("SELECT * FROM sms_preferences WHERE user_id=?").get((res.locals.user as User).id) as Preference|undefined;
    res.json({ optedIn:p?.opted_in===1, phone:p?.phone??"", verified:p?.verified===1, deliveryAvailable:!!provider, consent:SMS_CONSENT });
  });
  app.put("/api/auth/sms", auth, limiter, (req,res) => {
    const user = res.locals.user as User;
    if (typeof req.body?.optedIn !== "boolean") {res.status(400).json({error:"Choose whether to receive SMS."});return;}
    if (!req.body.optedIn) {
      db.prepare("UPDATE sms_preferences SET opted_in=0,challenge=NULL,challenge_expires=NULL WHERE user_id=?").run(user.id);
      db.prepare("UPDATE sms_outbox SET status='cancelled' WHERE user_id=? AND status='pending'").run(user.id);
      res.json({message:"SMS updates turned off."});return;
    }
    const phone = typeof req.body.phone === "string" ? req.body.phone.replace(/[ ()-]/g,"") : "";
    if (!/^\+[1-9]\d{7,14}$/.test(phone) || req.body.consent !== true) {res.status(400).json({error:"Enter a phone number with country code, and check the SMS consent box."});return;}
    const old = db.prepare("SELECT * FROM sms_preferences WHERE user_id=?").get(user.id) as Preference|undefined;
    db.prepare(`INSERT INTO sms_preferences(user_id,phone,opted_in,consent_at,consent_version,verified) VALUES (?,?,1,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,opted_in=1,consent_at=excluded.consent_at,consent_version=excluded.consent_version,verified=excluded.verified,challenge=NULL,challenge_expires=NULL`)
      .run(user.id,phone,Date.now(),SMS_CONSENT,old && old.phone===phone && old.opted_in===1 ? old.verified : 0);
    res.json({message:provider ? "Preference saved. Verify your phone to activate updates." : "Preference saved. SMS delivery is not active yet; phone verification will be required when it becomes available."});
  });
  app.post("/api/auth/sms/verify", auth, limiter, async (_req,res) => {
    if (!provider) {res.status(503).json({error:"SMS delivery is not active yet."});return;}
    const id=(res.locals.user as User).id;
    const p=db.prepare("SELECT * FROM sms_preferences WHERE user_id=?").get(id) as Preference|undefined;
    if (!p?.opted_in) {res.status(400).json({error:"Save your phone number and opt-in first."});return;}
    const challenge=await provider.startVerification(p.phone);
    db.prepare("UPDATE sms_preferences SET challenge=?,challenge_expires=? WHERE user_id=? AND phone=? AND opted_in=1").run(challenge,Date.now()+600000,id,p.phone);
    res.json({message:"Verification code sent."});
  });
  app.post("/api/auth/sms/confirm", auth, limiter, async (req,res) => {
    if (!provider) {res.status(503).json({error:"SMS delivery is not active yet."});return;}
    const id=(res.locals.user as User).id;
    const p=db.prepare("SELECT * FROM sms_preferences WHERE user_id=?").get(id) as Preference|undefined;
    if (!p?.opted_in || !p.challenge || (p.challenge_expires??0)<=Date.now() || typeof req.body?.code!=="string" || !/^\d{4,10}$/.test(req.body.code)) {res.status(400).json({error:"Request a new code and enter it here."});return;}
    const approved=await provider.checkVerification(p.challenge,req.body.code);
    if (!approved) {res.status(400).json({error:"That code is invalid or expired."});return;}
    const result=db.prepare("UPDATE sms_preferences SET verified=1,challenge=NULL,challenge_expires=NULL WHERE user_id=? AND phone=? AND challenge=? AND opted_in=1").run(id,p.phone,p.challenge);
    if (!result.changes) {res.status(409).json({error:"Your SMS preferences changed. Please try again."});return;}
    res.json({message:"Phone verified. Saturday updates are on."});
  });
}
// The approved transport's authenticated STOP webhook must call this before activation.
export function stopSms(db:DatabaseSync, phone:string) {
  transaction(db,()=>{
    db.prepare("UPDATE sms_preferences SET opted_in=0,challenge=NULL,challenge_expires=NULL WHERE phone=?").run(phone);
    db.prepare("UPDATE sms_outbox SET status='cancelled' WHERE status='pending' AND user_id IN (SELECT user_id FROM sms_preferences WHERE phone=?)").run(phone);
  });
}
export async function pollSaturdayUpdates(db:DatabaseSync, provider?:SmsProvider, load=getResults, now=Date.now()) {
  const weeks=db.prepare("SELECT w.*,p.timezone FROM pool_weeks w JOIN pools p ON p.id=w.pool_id WHERE w.published=1 AND w.saturday BETWEEN ? AND ?").all(
    new Date(now-86400000).toISOString().slice(0,10),new Date(now+86400000).toISOString().slice(0,10)) as {pool_id:string;saturday:string;games_json:string;timezone:string}[];
  for (const week of weeks) {
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:week.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
    if(today!==week.saturday) continue;
    const games=JSON.parse(week.games_json) as {id:number;startDate:string}[];
    if (!games.some(g=>Date.parse(g.startDate)<=now)) continue;
    let results:Awaited<ReturnType<typeof getResults>>;
    try {results=await load(week.saturday);} catch {continue;}
    for (const game of games) {
      const r=results.find(r=>r.id===game.id);
      if(!r?.completed || !Number.isSafeInteger(r.homePoints) || !Number.isSafeInteger(r.awayPoints) || Number(r.homePoints)<0 || Number(r.awayPoints)<0) continue;
      transaction(db,()=>{
        db.prepare(`INSERT INTO game_results VALUES (?,?,?,?,?) ON CONFLICT(game_id) DO UPDATE SET completed=excluded.completed,home_points=excluded.home_points,away_points=excluded.away_points,checked_at=excluded.checked_at`).run(r.id,1,r.homePoints,r.awayPoints,now);
        const event=db.prepare("INSERT OR IGNORE INTO sms_final_events VALUES (?,?,?,?)").run(week.pool_id,week.saturday,game.id,now);
        if(!event.changes) return;
        // No backlog for later subscribers. Only members already verified and opted in.
        db.prepare(`INSERT OR IGNORE INTO sms_outbox(user_id,pool_id,saturday,game_id,created_at)
          SELECT s.user_id,?,?,?,? FROM sms_preferences s JOIN memberships m ON m.user_id=s.user_id
          WHERE m.pool_id=? AND s.opted_in=1 AND s.verified=1 AND s.consent_at<=?`).run(week.pool_id,week.saturday,game.id,now,week.pool_id,now);
      });
    }
  }
  if (!provider || !process.env.APP_ORIGIN?.startsWith("https://")) return;
  const jobs=db.prepare("SELECT * FROM sms_outbox WHERE status='pending' ORDER BY id LIMIT 100").all() as {id:number;user_id:string;pool_id:string;saturday:string;created_at:number}[];
  for(const job of jobs) {
    const p=db.prepare("SELECT s.* FROM sms_preferences s JOIN memberships m ON m.user_id=s.user_id WHERE s.user_id=? AND m.pool_id=?").get(job.user_id,job.pool_id) as Preference|undefined;
    const pool=db.prepare("SELECT timezone FROM pools WHERE id=?").get(job.pool_id) as {timezone:string}|undefined;
    const today=pool && new Intl.DateTimeFormat("en-CA",{timeZone:pool.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
    if(!p?.opted_in || !p.verified || p.consent_at > job.created_at || today!==job.saturday || now-job.created_at>3600000) {db.prepare("UPDATE sms_outbox SET status='cancelled' WHERE id=?").run(job.id);continue;}
    const claim=db.prepare("UPDATE sms_outbox SET status='sending' WHERE id=? AND status='pending'").run(job.id);
    if(!claim.changes) continue;
    const link=new URL(process.env.APP_ORIGIN!);link.searchParams.set("pool",job.pool_id);link.searchParams.set("week",job.saturday);link.hash="standings";
    try {
      const sent=await provider.send(p.phone,"Picks Club: A game is final. View current standings: "+link.toString()+" Reply STOP to opt out.");
      db.prepare("UPDATE sms_outbox SET status='sent',provider_id=? WHERE id=?").run(sent.id,job.id);
    } catch {
      // An ambiguous timeout might already have sent. Never blindly retry and duplicate.
      db.prepare("UPDATE sms_outbox SET status='unknown' WHERE id=?").run(job.id);
    }
  }
}

