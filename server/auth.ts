import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Database } from "./database.js";
import type { Request, Response, NextFunction } from "express";
const derive = promisify(scrypt);
export type User = {
  id: string;
  email: string;
  name: string;
  favoriteTeams: string[];
  photoUrl?: string;
  venmoUrl?: string;
  emailVerified?: boolean;
  ageConfirmed?: boolean;
};
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, encoded] = stored.split(":");
  const hash = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(encoded, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
export function sessionToken(req: Request) {
  return (
    req.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("picks_session="))
      ?.slice(14) ?? ""
  );
}
export async function startSession(
  db: Database,
  req: Request,
  res: Response,
  userId: string,
) {
  const token = randomBytes(32).toString("hex");
  await db
    .prepare("DELETE FROM sessions WHERE token_hash=? OR expires_at <= ?")
    .run(tokenHash(sessionToken(req)), Date.now());
  await db
    .prepare("INSERT INTO sessions VALUES (?,?,?)")
    .run(tokenHash(token), userId, Date.now() + 7 * 86400000);
  res.cookie("picks_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 86400000,
  });
}
export function requireUser(db: Database) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = sessionToken(req);
    const user =
      token &&
      (await db
        .prepare(
          `SELECT u.id,u.email,u.name,u.favorites_json,u.photo_url,u.venmo_url FROM users u
      JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`,
        )
        .get(tokenHash(token), Date.now()));
    if (!user) {
      res.status(401).json({ error: "Please sign in." });
      return;
    }
    res.locals.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      photoUrl: user.photo_url,
      venmoUrl: user.venmo_url,
      favoriteTeams: JSON.parse(String(user.favorites_json)),
      emailVerified: !!(await db
        .prepare("SELECT 1 FROM verified_emails WHERE user_id=?")
        .get(String(user.id))),
      ageConfirmed: !!(await db
        .prepare("SELECT 1 FROM age_acknowledgments WHERE user_id=?")
        .get(String(user.id))),
    } as User;
    next();
  };
}
// Bounds password-hash work and login guessing; no raw credentials are logged/stored here.
export function authLimiter() {
  const attempts = new Map<
    string,
    {
      count: number;
      until: number;
    }
  >();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    for (const [key, entry] of attempts)
      if (entry.until <= now) attempts.delete(key);
    const key = req.ip ?? "unknown";
    const entry = attempts.get(key) ?? { count: 0, until: now + 15 * 60000 };
    entry.count++;
    attempts.set(key, entry);
    if (entry.count > 30) {
      res.setHeader("Retry-After", Math.ceil((entry.until - now) / 1000));
      res
        .status(429)
        .json({ error: "Too many attempts. Try again in 15 minutes." });
      return;
    }
    next();
  };
}
