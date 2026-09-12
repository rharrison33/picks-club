import { randomBytes } from "node:crypto";
import type { Express } from "express";
import type { Database } from "./database.js";
import {
  authLimiter,
  hashPassword,
  requireUser,
  tokenHash,
  type User,
} from "./auth.js";
import { transaction } from "./database.js";
export const emailReady = () =>
  !!(
    process.env.RESEND_API_KEY &&
    process.env.EMAIL_FROM &&
    process.env.APP_ORIGIN
  );
export async function sendAccountEmail(
  to: string,
  purpose: "verify" | "reset",
  token: string,
) {
  if (!emailReady()) throw new Error("Email delivery is not configured.");
  const link = process.env.APP_ORIGIN + "/#" + purpose + "=" + token;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject:
        purpose === "verify"
          ? "Verify your Picks Club email"
          : "Reset your Picks Club password",
      text:
        (purpose === "verify" ? "Verify your email" : "Reset your password") +
        ": " +
        link +
        "\nThis single-use link expires in 30 minutes. If you did not request it, ignore this email.",
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Email delivery failed.");
}
export function addRecoveryRoutes(
  app: Express,
  db: Database,
  send = sendAccountEmail,
) {
  const limiter = authLimiter();
  async function issue(id: string, email: string, purpose: "verify" | "reset") {
    const token = randomBytes(32).toString("hex"),
      hash = tokenHash(token);
    await db
      .prepare("DELETE FROM email_tokens WHERE expires_at<=?")
      .run(Date.now());
    await db
      .prepare("INSERT INTO email_tokens VALUES (?,?,?,?)")
      .run(hash, id, purpose, Date.now() + 30 * 60000);
    try {
      await send(email, purpose, token);
    } catch {
      await db.prepare("DELETE FROM email_tokens WHERE token_hash=?").run(hash);
      throw new Error("Email delivery is unavailable. Please try again later.");
    }
  }
  app.post(
    "/api/auth/request-verification",
    limiter,
    requireUser(db),
    async (_req, res) => {
      const user = res.locals.user as User;
      await issue(user.id, user.email, "verify");
      res.json({ message: "Check your inbox for a verification link." });
    },
  );
  app.post("/api/auth/forgot-password", limiter, async (req, res) => {
    if (typeof req.body?.email !== "string" || req.body.email.length > 254) {
      res.status(400).json({ error: "Enter your email address." });
      return;
    }
    const user = (await db
      .prepare("SELECT id,email FROM users WHERE email=?")
      .get(req.body.email.trim().toLowerCase())) as
      | {
          id: string;
          email: string;
        }
      | undefined;
    // Identical response for unknown addresses and delivery failures prevents enumeration.
    if (user) {
      try {
        await issue(user.id, user.email, "reset");
      } catch {
        console.error("Password recovery delivery failed.");
      }
    }
    res.json({
      message:
        "If an account exists, a reset link will be sent. Check your inbox and spam folder.",
    });
  });
  app.post("/api/auth/complete-email", limiter, async (req, res) => {
    const { token, purpose, password } = req.body ?? {};
    if (
      typeof token !== "string" ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !["verify", "reset"].includes(purpose)
    ) {
      res.status(400).json({ error: "Invalid or expired link." });
      return;
    }
    if (
      purpose === "reset" &&
      (typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128)
    ) {
      res.status(400).json({ error: "Use a password with 8–128 characters." });
      return;
    }
    const hash = tokenHash(token);
    const record = (await db
      .prepare(
        "SELECT user_id FROM email_tokens WHERE token_hash=? AND purpose=? AND expires_at>?",
      )
      .get(hash, purpose, Date.now())) as
      | {
          user_id: string;
        }
      | undefined;
    if (!record) {
      res.status(400).json({ error: "Invalid or expired link." });
      return;
    }
    const passwordHash =
      purpose === "reset" ? await hashPassword(password) : null;
    let used = false;
    await transaction(db, async () => {
      const deleted = await db
        .prepare("DELETE FROM email_tokens WHERE token_hash=? AND expires_at>?")
        .run(hash, Date.now());
      if (!deleted.changes) return;
      used = true;
      if (passwordHash) {
        await db
          .prepare("UPDATE users SET password_hash=? WHERE id=?")
          .run(passwordHash, record.user_id);
        await db
          .prepare("DELETE FROM sessions WHERE user_id=?")
          .run(record.user_id);
        await db
          .prepare("DELETE FROM email_tokens WHERE user_id=?")
          .run(record.user_id);
      } else
        await db
          .prepare(
            "INSERT INTO verified_emails VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET verified_at=excluded.verified_at",
          )
          .run(record.user_id, Date.now());
    });
    if (!used) {
      res.status(400).json({ error: "Invalid or expired link." });
      return;
    }
    res.json({
      message:
        purpose === "reset"
          ? "Password reset. Sign in with your new password."
          : "Email verified. Return to Picks Club.",
    });
  });
}
