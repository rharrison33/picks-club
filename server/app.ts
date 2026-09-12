import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Database } from "./database.js";
import { transaction } from "./database.js";
import {
  hashPassword,
  verifyPassword,
  requireUser,
  startSession,
  sessionToken,
  tokenHash,
  authLimiter,
  type User,
} from "./auth.js";
import {
  getSlate,
  getTeamOptions,
  isSaturday,
  nextSaturday,
  type Slate,
} from "./sports.js";
import { lineupOpen } from "./lineup-deadline.js";
import { addContestRoutes } from "./contest.js";
import { addRecoveryRoutes, emailReady } from "./recovery.js";
import { addSmsRoutes } from "./sms.js";
export const timezones = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];
type Pool = {
  id: string;
  name: string;
  invite_code: string;
  timezone: string;
  default_fee_cents: number;
  prizes_json: string;
  venmo_url: string;
  role: "organizer" | "player";
};
type Week = {
  pool_id: string;
  saturday: string;
  fee_cents: number;
  games_json: string;
  published: number;
  prizes_json: string;
};
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function check(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
function cents(value: unknown): asserts value is number {
  check(
    Number.isSafeInteger(value) &&
      Number(value) >= 1000 &&
      Number(value) <= 250000,
    "Entry amount must be between $10 and $2,500 in whole cents.",
  );
}
const inviteCode = () => randomBytes(12).toString("hex").toUpperCase();
function prizes(value: unknown) {
  check(
    Array.isArray(value) &&
      value.length >= 1 &&
      value.length <= 10 &&
      value.every((v) => Number.isInteger(v) && v > 0 && v <= 100) &&
      value.reduce((sum, v) => sum + v, 0) === 100,
    "Prize percentages must be positive whole numbers totaling 100 (up to 10 places).",
  );
}
const user = (res: Response) => res.locals.user as User;
const param = (req: Request, key: string) => String(req.params[key]);
function venmoLink(value: unknown): string {
  if (value === "" || value === undefined) return "";
  check(
    typeof value === "string" && value.length <= 500,
    "Enter a valid Venmo profile link.",
  );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, "Use an HTTPS Venmo profile link.");
  }
  check(
    url.protocol === "https:" &&
      ["venmo.com", "www.venmo.com", "account.venmo.com"].includes(
        url.hostname,
      ) &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname !== "/",
    "Use an HTTPS link on venmo.com or account.venmo.com.",
  );
  return url.toString();
}
export function createApp(
  db: Database,
  slateLoader: typeof getSlate = getSlate,
  teamLoader = getTeamOptions,
  now = Date.now,
) {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY_HOPS)
    app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS));
  app.use((_req, res, next) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
    }
    next();
  });
  app.use("/api/auth/profile", express.json({ limit: "128kb" }));
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      const allowed = process.env.APP_ORIGIN
        ? [process.env.APP_ORIGIN]
        : ["http://localhost:5173", "http://127.0.0.1:5173"];
      if (
        req.get("X-Requested-With") !== "PicksClub" ||
        (origin && !allowed.includes(origin))
      ) {
        res.status(403).json({ error: "Request origin is not allowed." });
        return;
      }
    }
    next();
  });
  const auth = requireUser(db);
  const limiter = authLimiter();
  async function favorites(value: unknown) {
    check(
      Array.isArray(value) &&
        value.length >= 1 &&
        value.length <= 5 &&
        value.every((v) => typeof v === "string") &&
        new Set(value).size === value.length,
      "Choose 1–5 different favorite teams.",
    );
    const teams = await teamLoader();
    check(
      value.every((v) => teams.includes(v)),
      "Choose teams from the team list.",
    );
  }
  app.get("/api/teams", async (_req, res) =>
    res.json({ teams: await teamLoader() }),
  );
  async function member(
    poolId: string,
    userId: string,
    organizer = false,
  ): Promise<Pool> {
    const pool = (await db
      .prepare(
        "SELECT p.*,m.role FROM pools p JOIN memberships m ON m.pool_id=p.id WHERE p.id=? AND m.user_id=?",
      )
      .get(poolId, userId)) as Pool | undefined;
    check(pool, "Pool not found or you are not a member.", 404);
    check(
      !organizer || pool.role === "organizer",
      "Only organizers can do that.",
      403,
    );
    return pool;
  }
  async function view(pool: Pool) {
    return {
      id: pool.id,
      name: pool.name,
      timezone: pool.timezone,
      defaultFeeCents: pool.default_fee_cents,
      prizePercentages: JSON.parse(pool.prizes_json),
      venmoUrl: pool.venmo_url,
      role: pool.role,
      ...(pool.role === "organizer" ? { inviteCode: pool.invite_code } : {}),
      members: await db
        .prepare(
          `SELECT u.id,u.name,u.photo_url AS "photoUrl",${pool.role === "organizer" ? "u.venmo_url" : "''"} AS "venmoUrl",m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.pool_id=? ORDER BY m.role,u.name,u.id`,
        )
        .all(pool.id),
    };
  }
  app.get("/api/health", async (_req, res) => {
    try {
      await db.prepare("SELECT 1").get();
      res.json({ status: "ok", database: "postgres" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  app.get("/api/config", (_req, res) =>
    res.json({
      timezones,
      nextSaturday: nextSaturday(),
      emailEnabled: emailReady(),
      requireVerified: process.env.NODE_ENV === "production",
      registrationRestricted: !!process.env.REGISTRATION_CODE,
    }),
  );
  app.post("/api/auth/register", limiter, async (req, res) => {
    if (process.env.REGISTRATION_CODE)
      check(
        typeof req.body?.registrationCode === "string" &&
          tokenHash(req.body.registrationCode) ===
            tokenHash(process.env.REGISTRATION_CODE),
        "Enter your pilot access code.",
        403,
      );
    const { email, password, name, favoriteTeams } = req.body ?? {};
    check(
      typeof email === "string" &&
        email.length <= 254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
      "Enter a valid email address.",
    );
    check(
      typeof password === "string" &&
        password.length >= 8 &&
        password.length <= 128,
      "Use a password with 8–128 characters.",
    );
    check(
      typeof name === "string" &&
        name.trim().length >= 3 &&
        name.trim().length <= 60,
      "Display name must be 3–60 characters.",
    );
    await favorites(favoriteTeams);
    check(
      req.body.ageConfirmed === true,
      "You must confirm you are at least 21 years old.",
    );
    const normalized = email.trim().toLowerCase();
    check(
      !(await db.prepare("SELECT id FROM users WHERE email=?").get(normalized)),
      "An account with that email already exists.",
      409,
    );
    const passwordHash = await hashPassword(password);
    const id = randomUUID();
    try {
      await db
        .prepare(
          "INSERT INTO users(id,email,name,state,password_hash,favorites_json) VALUES (?,?,?,?,?,?)",
        )
        .run(
          id,
          normalized,
          name.trim(),
          "",
          passwordHash,
          JSON.stringify(favoriteTeams),
        );
    } catch {
      throw new HttpError(409, "An account with that email already exists.");
    }
    await startSession(db, req, res, id);
    await db
      .prepare("INSERT INTO age_acknowledgments VALUES (?,?,?)")
      .run(id, Date.now(), "21-plus-v1");
    res.status(201).json({
      user: {
        id,
        email: normalized,
        name: name.trim(),
        favoriteTeams,
        ageConfirmed: true,
      },
    });
  });
  app.post("/api/auth/login", limiter, async (req, res) => {
    const { email, password } = req.body ?? {};
    check(
      typeof email === "string" &&
        email.length <= 254 &&
        typeof password === "string" &&
        password.length <= 128,
      "Invalid email or password.",
      401,
    );
    const record = (await db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email.trim().toLowerCase())) as
      | (User & {
          password_hash: string;
          favorites_json: string;
          photo_url: string;
          venmo_url: string;
        })
      | undefined;
    const valid = await verifyPassword(
      password,
      record?.password_hash ??
        "00000000000000000000000000000000:" + "00".repeat(64),
    );
    check(record && valid, "Invalid email or password.", 401);
    await startSession(db, req, res, record.id);
    res.json({
      user: {
        id: record.id,
        email: record.email,
        name: record.name,
        photoUrl: record.photo_url,
        venmoUrl: record.venmo_url,
        favoriteTeams: JSON.parse(record.favorites_json),
        ageConfirmed: !!(await db
          .prepare("SELECT 1 FROM age_acknowledgments WHERE user_id=?")
          .get(record.id)),
        emailVerified: !!(await db
          .prepare("SELECT 1 FROM verified_emails WHERE user_id=?")
          .get(record.id)),
      },
    });
  });
  app.get("/api/auth/me", auth, (_req, res) => res.json({ user: user(res) }));
  app.post("/api/auth/logout", async (req, res) => {
    await db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(tokenHash(sessionToken(req)));
    res.clearCookie("picks_session", {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    res.json({ ok: true });
  });
  app.patch("/api/auth/profile", auth, async (req, res) => {
    check(
      typeof req.body?.name === "string" &&
        req.body.name.trim().length >= 3 &&
        req.body.name.trim().length <= 60,
      "Display name must be 3–60 characters.",
    );
    await favorites(req.body.favoriteTeams);
    const venmoUrl =
      req.body.venmoUrl === undefined
        ? (user(res).venmoUrl ?? "")
        : venmoLink(req.body.venmoUrl);
    const photoUrl =
      req.body.photoUrl === undefined
        ? (user(res).photoUrl ?? "")
        : req.body.photoUrl;
    check(
      typeof photoUrl === "string" && photoUrl.length <= 90000,
      "Photo must be smaller than 64 KB after resizing.",
    );
    if (photoUrl) {
      check(
        /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photoUrl),
        "Upload a JPEG profile photo.",
      );
      const bytes = Buffer.from(
        photoUrl.slice(photoUrl.indexOf(",") + 1),
        "base64",
      );
      check(
        bytes.length <= 65536 &&
          bytes[0] === 255 &&
          bytes[1] === 216 &&
          bytes[bytes.length - 2] === 255 &&
          bytes[bytes.length - 1] === 217,
        "Invalid JPEG photo.",
      );
    }
    await db
      .prepare(
        "UPDATE users SET name=?,favorites_json=?,photo_url=?,venmo_url=? WHERE id=?",
      )
      .run(
        req.body.name.trim(),
        JSON.stringify(req.body.favoriteTeams),
        photoUrl,
        venmoUrl,
        user(res).id,
      );
    res.json({
      user: {
        ...user(res),
        name: req.body.name.trim(),
        favoriteTeams: req.body.favoriteTeams,
        photoUrl,
        venmoUrl,
      },
    });
  });
  addRecoveryRoutes(app, db);
  addSmsRoutes(app, db);
  app.post("/api/auth/acknowledge-age", auth, async (req, res) => {
    check(req.body?.ageConfirmed === true, "Confirm that you are at least 21.");
    await db
      .prepare(
        "INSERT INTO age_acknowledgments VALUES (?,?,?) ON CONFLICT DO NOTHING",
      )
      .run(user(res).id, Date.now(), "21-plus-v1");
    res.json({ user: { ...user(res), ageConfirmed: true } });
  });
  app.use("/api/pools", auth, (_req, res, next) => {
    if (!user(res).ageConfirmed) {
      res.status(403).json({
        error: "Confirm that you are at least 21 before joining a pool.",
      });
      return;
    }
    if (process.env.NODE_ENV === "production" && !user(res).emailVerified) {
      res
        .status(403)
        .json({ error: "Verify your email before joining a pool." });
      return;
    }
    next();
  });
  app.get("/api/pools", auth, async (_req, res) => {
    const pools = (await db
      .prepare(
        "SELECT p.*,m.role FROM pools p JOIN memberships m ON m.pool_id=p.id WHERE m.user_id=? ORDER BY p.created_at,p.id",
      )
      .all(user(res).id)) as Pool[];
    res.json({ pools: await Promise.all(pools.map(view)) });
  });
  app.post("/api/pools", auth, async (req, res) => {
    const organizers = process.env.PILOT_ORGANIZER_EMAILS?.split(",").map(
      (email) => email.trim().toLowerCase(),
    );
    if (organizers)
      check(
        organizers.includes(user(res).email),
        "Only designated pilot organizers can create pools.",
        403,
      );
    const {
      name,
      timezone,
      defaultFeeCents,
      prizePercentages = [100],
    } = req.body ?? {};
    check(
      typeof name === "string" &&
        name.trim().length >= 2 &&
        name.trim().length <= 80,
      "Pool name must be 2–80 characters.",
    );
    check(timezones.includes(timezone), "Choose a supported timezone.");
    cents(defaultFeeCents);
    prizes(prizePercentages);
    const id = randomUUID();
    await transaction(db, async () => {
      if (process.env.PILOT_POOL_LIMIT)
        check(
          Number(
            (
              (await db
                .prepare("SELECT COUNT(*) AS count FROM pools")
                .get()) as {
                count: number;
              }
            ).count,
          ) < Number(process.env.PILOT_POOL_LIMIT),
          "The pilot pool limit has been reached.",
          409,
        );
      await db
        .prepare(
          "INSERT INTO pools(id,name,invite_code,timezone,default_fee_cents,prizes_json) VALUES (?,?,?,?,?,?)",
        )
        .run(
          id,
          name.trim(),
          inviteCode(),
          timezone,
          defaultFeeCents,
          JSON.stringify(prizePercentages),
        );
      await db
        .prepare(
          "INSERT INTO memberships(pool_id,user_id,role) VALUES (?,?,'organizer')",
        )
        .run(id, user(res).id);
    });
    res.status(201).json({ pool: await view(await member(id, user(res).id)) });
  });
  app.post("/api/pools/join", auth, async (req, res) => {
    check(
      typeof req.body?.code === "string" &&
        /^[a-fA-F0-9]{24}$/.test(req.body.code.trim()),
      "Enter a valid invitation code.",
    );
    const pool = (await db
      .prepare("SELECT id FROM pools WHERE invite_code=?")
      .get(req.body.code.trim().toUpperCase())) as
      | {
          id: string;
        }
      | undefined;
    check(pool, "Invitation code not found.", 404);
    await db
      .prepare(
        "INSERT INTO memberships(pool_id,user_id,role) VALUES (?,?,'player') ON CONFLICT DO NOTHING",
      )
      .run(pool.id, user(res).id);
    res.json({ pool: await view(await member(pool.id, user(res).id)) });
  });
  app.get("/api/pools/:id", auth, async (req, res) =>
    res.json({
      pool: await view(await member(param(req, "id"), user(res).id)),
    }),
  );
  app.patch("/api/pools/:id", auth, async (req, res) => {
    const pool = await member(param(req, "id"), user(res).id, true);
    const { name, defaultFeeCents, prizePercentages = [100] } = req.body ?? {};
    check(
      typeof name === "string" &&
        name.trim().length >= 2 &&
        name.trim().length <= 80,
      "Pool name must be 2–80 characters.",
    );
    cents(defaultFeeCents);
    prizes(prizePercentages);
    const venmo =
      req.body.venmoUrl === undefined
        ? pool.venmo_url
        : venmoLink(req.body.venmoUrl);
    await db
      .prepare(
        "UPDATE pools SET name=?,default_fee_cents=?,prizes_json=?,venmo_url=? WHERE id=?",
      )
      .run(
        name.trim(),
        defaultFeeCents,
        JSON.stringify(prizePercentages),
        venmo,
        pool.id,
      );
    res.json({ pool: await view(await member(pool.id, user(res).id)) });
  });
  app.post("/api/pools/:id/invite", auth, async (req, res) => {
    const pool = await member(param(req, "id"), user(res).id, true);
    await db
      .prepare("UPDATE pools SET invite_code=? WHERE id=?")
      .run(inviteCode(), pool.id);
    res.json({ pool: await view(await member(pool.id, user(res).id)) });
  });
  app.patch("/api/pools/:id/members/:userId", auth, async (req, res) => {
    const pool = await member(param(req, "id"), user(res).id, true);
    const target = param(req, "userId");
    check(
      req.body?.role === "organizer" || req.body?.role === "player",
      "Invalid role.",
    );
    await transaction(db, async () => {
      const current = (await db
        .prepare("SELECT role FROM memberships WHERE pool_id=? AND user_id=?")
        .get(pool.id, target)) as
        | {
            role: string;
          }
        | undefined;
      check(current, "Member not found.", 404);
      const count = (
        (await db
          .prepare(
            "SELECT COUNT(*) AS count FROM memberships WHERE pool_id=? AND role='organizer'",
          )
          .get(pool.id)) as {
          count: number;
        }
      ).count;
      check(
        !(
          current.role === "player" &&
          req.body.role === "organizer" &&
          count >= 2
        ),
        "A pool can have at most two organizers.",
        409,
      );
      check(
        !(
          current.role === "organizer" &&
          req.body.role === "player" &&
          count <= 1
        ),
        "A pool must keep at least one organizer.",
        409,
      );
      await db
        .prepare("UPDATE memberships SET role=? WHERE pool_id=? AND user_id=?")
        .run(req.body.role, pool.id, target);
    });
    res.json({ pool: await view(await member(pool.id, user(res).id)) });
  });
  async function readWeek(pool: Pool, saturday: string) {
    const week = (await db
      .prepare("SELECT * FROM pool_weeks WHERE pool_id=? AND saturday=?")
      .get(pool.id, saturday)) as Week | undefined;
    const published = week?.published === 1;
    return {
      saturday,
      feeCents: week?.fee_cents ?? pool.default_fee_cents,
      prizePercentages: JSON.parse(week?.prizes_json ?? pool.prizes_json),
      published,
      games:
        week && (published || pool.role === "organizer")
          ? (JSON.parse(week.games_json) as Slate["games"])
          : [],
      saved: !!week,
      paymentsEnabled: false,
    };
  }
  app.get("/api/pools/:id/weeks/:date", auth, async (req, res) => {
    const pool = await member(param(req, "id"), user(res).id);
    check(isSaturday(req.params.date), "Choose a Saturday.");
    res.json({ week: await readWeek(pool, param(req, "date")) });
  });
  app.get("/api/pools/:id/games", auth, async (req, res) => {
    const pool = await member(param(req, "id"), user(res).id, true);
    check(isSaturday(req.query.date), "Choose a Saturday.");
    check(
      lineupOpen(req.query.date, pool.timezone, now()),
      "Lineup selection is available Monday at 11 a.m. through Thursday night in your pool's time zone.",
      409,
    );
    const favoritesByMember = (await db
      .prepare(
        "SELECT u.favorites_json FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.pool_id=?",
      )
      .all(pool.id)) as {
      favorites_json: string;
    }[];
    res.json(
      await slateLoader(
        req.query.date,
        favoritesByMember.map((u) => JSON.parse(u.favorites_json) as string[]),
        pool.timezone,
      ),
    );
  });
  app.put("/api/pools/:id/weeks/:date", auth, async (req, res) => {
    const pool = await member(param(req, "id"), user(res).id, true);
    const saturday = param(req, "date");
    check(isSaturday(saturday), "Choose a Saturday.");
    check(
      lineupOpen(saturday, pool.timezone, now()),
      "Lineup selection is available Monday at 11 a.m. through Thursday night in your pool's time zone.",
      409,
    );
    cents(req.body?.feeCents);
    const ids: unknown = req.body?.gameIds;
    check(
      Array.isArray(ids) &&
        ids.length <= 8 &&
        ids.every(Number.isSafeInteger) &&
        new Set(ids).size === ids.length,
      "Choose up to eight different games.",
    );
    check(
      typeof req.body?.publish === "boolean",
      "Specify whether to publish.",
    );
    check(
      !req.body.publish || ids.length === 8,
      "Choose exactly eight games before publishing.",
    );
    // Entry configuration is available for planning; real-money checkout is not activated.
    if (
      process.env.NODE_ENV === "production" &&
      req.body.publish &&
      req.body.feeCents > 0
    ) {
      throw new HttpError(
        409,
        "Paid contests are not activated. Provider approval and state eligibility review are required before collecting entry money.",
      );
    }
    // Re-fetch from our cached provider data; clients cannot invent games or kickoff times.
    const favoritesByMember = (await db
      .prepare(
        "SELECT u.favorites_json FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.pool_id=?",
      )
      .all(pool.id)) as {
      favorites_json: string;
    }[];
    const slate = ids.length
      ? await slateLoader(
          saturday,
          favoritesByMember.map(
            (u) => JSON.parse(u.favorites_json) as string[],
          ),
          pool.timezone,
        )
      : null;
    const selected = ids.map((id) => slate?.games.find((g) => g.id === id));
    check(
      selected.every((g) => g && Date.parse(g.startDate) > Date.now()),
      "Games must be on this Saturday and must not have started.",
    );
    await transaction(db, async () => {
      await member(pool.id, user(res).id, true); // Recheck after awaiting the external feed.
      check(
        lineupOpen(saturday, pool.timezone, now()),
        "Lineup selection is available Monday at 11 a.m. through Thursday night in your pool's time zone.",
        409,
      );
      const existing = (await db
        .prepare("SELECT * FROM pool_weeks WHERE pool_id=? AND saturday=?")
        .get(pool.id, saturday)) as Week | undefined;
      check(
        !existing?.published,
        "Published weeks are locked. Entry amounts and games cannot be changed.",
        409,
      );
      check(
        saturday >= nextSaturday(pool.timezone),
        "Past weeks cannot be changed.",
      );
      await db
        .prepare(
          `INSERT INTO pool_weeks(pool_id,saturday,fee_cents,games_json,published,prizes_json) VALUES (?,?,?,?,?,?)
        ON CONFLICT(pool_id,saturday) DO UPDATE SET fee_cents=excluded.fee_cents,games_json=excluded.games_json,published=excluded.published,prizes_json=excluded.prizes_json,updated_at=CURRENT_TIMESTAMP`,
        )
        .run(
          pool.id,
          saturday,
          req.body.feeCents,
          JSON.stringify(selected),
          req.body.publish ? 1 : 0,
          pool.prizes_json,
        );
    });
    res.json({ week: await readWeek(pool, saturday) });
  });
  addContestRoutes(app, db);
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  if (process.env.SERVE_CLIENT === "true") {
    const clientPath = fileURLToPath(
      new URL("../client/dist", import.meta.url),
    );
    app.use(express.static(clientPath));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(clientPath + "/index.html"),
    );
  }
  app.use(
    (
      error: Error & {
        status?: number;
      },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      const status =
        error instanceof HttpError
          ? error.status
          : error.status === 400
            ? 400
            : 500;
      if (status === 500) console.error("Request failed:", error.message);
      res.status(status).json({
        error:
          status === 500
            ? "Something went wrong. Please try again."
            : status === 400 && !(error instanceof HttpError)
              ? "Invalid request body."
              : error.message,
      });
    },
  );
  return app;
}
