import type { Express, Request, Response } from "express";
import type { Database } from "./database.js";
import { transaction } from "./database.js";
import { requireUser, type User } from "./auth.js";
import { isSaturday, getResults } from "./sports.js";
type Game = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  startDate: string;
};
type StoredWeek = {
  tiebreaker_game_id: number | null;
  games_json: string;
  published: number;
  prizes_json: string;
};
type Pick = {
  user_id: string;
  game_id: number;
  side: "home" | "away";
  updated_at: number;
};
type Result = {
  game_id: number;
  completed: number;
  home_points: number | null;
  away_points: number | null;
  checked_at: number;
};
export function addContestRoutes(
  app: Express,
  db: Database,
  resultsLoader = getResults,
  now = Date.now,
) {
  const auth = requireUser(db);
  async function context(req: Request, res: Response) {
    const pool = String(req.params.id),
      date = String(req.params.date);
    const user = res.locals.user as User;
    if (!isSaturday(date)) {
      res.status(400).json({ error: "Choose a Saturday." });
      return;
    }
    if (
      !(await db
        .prepare("SELECT 1 FROM memberships WHERE pool_id=? AND user_id=?")
        .get(pool, user.id))
    ) {
      res.status(404).json({ error: "Pool not found." });
      return;
    }
    const week = (await db
      .prepare("SELECT * FROM pool_weeks WHERE pool_id=? AND saturday=?")
      .get(pool, date)) as StoredWeek | undefined;
    if (!week?.published) {
      res.status(409).json({ error: "The week is not published yet." });
      return;
    }
    return {
      pool,
      date,
      user,
      games: JSON.parse(week.games_json) as Game[],
      tiebreakerGameId: week.tiebreaker_game_id,
      prizePercentages: JSON.parse(week.prizes_json) as number[],
    };
  }
  app.put("/api/pools/:id/weeks/:date/picks", auth, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    const { gameId, side } = req.body ?? {};
    const game = ctx.games.find((g) => g.id === gameId);
    if (!game || (side !== "home" && side !== "away")) {
      res.status(400).json({ error: "Choose a team in this week's lineup." });
      return;
    }
    // The published kickoff is an immutable deadline, even if the game is delayed.
    const timestamp = now();
    const final = await db
      .prepare("SELECT completed FROM game_results WHERE game_id=?")
      .get(game.id);
    if (timestamp >= Date.parse(game.startDate) || final?.completed === 1) {
      res.status(409).json({ error: "This pick is locked." });
      return;
    }
    await transaction(db, async () => {
      await db
        .prepare(
          `INSERT INTO picks(pool_id,saturday,user_id,game_id,side,updated_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(pool_id,saturday,user_id,game_id) DO UPDATE SET side=excluded.side,updated_at=excluded.updated_at`,
        )
        .run(ctx.pool, ctx.date, ctx.user.id, game.id, side, timestamp);
      await db
        .prepare(
          "INSERT INTO pick_audit(pool_id,saturday,user_id,game_id,side,saved_at) VALUES (?,?,?,?,?,?)",
        )
        .run(ctx.pool, ctx.date, ctx.user.id, game.id, side, timestamp);
    });
    res.json({ gameId, side, savedAt: timestamp });
  });
  app.put("/api/pools/:id/weeks/:date/tiebreaker", auth, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    const game = ctx.games.find((g) => g.id === ctx.tiebreakerGameId);
    const total = req.body?.total;
    if (!game) {
      res.status(409).json({ error: "This week has no tiebreaker game." });
      return;
    }
    if (!Number.isInteger(total) || total < 0 || total > 2147483647) {
      res
        .status(400)
        .json({ error: "Enter a nonnegative whole-number total score." });
      return;
    }
    const saved = await transaction(db, async () => {
      const final = await db
        .prepare("SELECT completed FROM game_results WHERE game_id=?")
        .get(game.id);
      if (now() >= Date.parse(game.startDate) || final?.completed === 1)
        return false;
      await db
        .prepare(
          `INSERT INTO tiebreaker_predictions(pool_id,saturday,user_id,total,updated_at) VALUES (?,?,?,?,?)
        ON CONFLICT(pool_id,saturday,user_id) DO UPDATE SET total=excluded.total,updated_at=excluded.updated_at`,
        )
        .run(ctx.pool, ctx.date, ctx.user.id, total, now());
      return true;
    });
    if (!saved) {
      res.status(409).json({ error: "The tiebreaker prediction is locked." });
      return;
    }
    res.json({ total });
  });
  app.get("/api/pools/:id/weeks/:date/contest", auth, async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    let feedUnavailable = false;
    // Only fetch results after kickoff; API-level cache shares calls across pools.
    if (ctx.games.some((g) => Date.parse(g.startDate) <= now())) {
      try {
        const results = await resultsLoader(ctx.date);
        const wanted = new Set(ctx.games.map((g) => g.id));
        await transaction(db, async () => {
          for (const r of results) {
            if (!wanted.has(r.id) || typeof r.completed !== "boolean") continue;
            const home =
              Number.isSafeInteger(r.homePoints) && Number(r.homePoints) >= 0
                ? r.homePoints
                : null;
            const away =
              Number.isSafeInteger(r.awayPoints) && Number(r.awayPoints) >= 0
                ? r.awayPoints
                : null;
            if (r.completed && (home === null || away === null)) continue;
            const existing = await db
              .prepare("SELECT completed FROM game_results WHERE game_id=?")
              .get(r.id);
            if (existing?.completed === 1 && !r.completed) continue;
            await db
              .prepare(
                `INSERT INTO game_results VALUES (?,?,?,?,?) ON CONFLICT(game_id) DO UPDATE SET
              completed=excluded.completed,home_points=excluded.home_points,away_points=excluded.away_points,checked_at=excluded.checked_at`,
              )
              .run(r.id, r.completed ? 1 : 0, home, away, now());
          }
        });
      } catch {
        feedUnavailable = true;
      }
    }
    const picks = (await db
      .prepare("SELECT * FROM picks WHERE pool_id=? AND saturday=?")
      .all(ctx.pool, ctx.date)) as Pick[];
    const games = await Promise.all(
      ctx.games.map(async (g) => {
        const result = (await db
          .prepare("SELECT * FROM game_results WHERE game_id=?")
          .get(g.id)) as Result | undefined;
        const locked =
          now() >= Date.parse(g.startDate) || result?.completed === 1;
        const complete = result?.completed === 1;
        const winner =
          complete && result.home_points !== result.away_points
            ? Number(result.home_points) > Number(result.away_points)
              ? "home"
              : "away"
            : null;
        return {
          ...g,
          locked,
          completed: complete,
          winner,
          homePoints: result?.home_points ?? null,
          awayPoints: result?.away_points ?? null,
          checkedAt: result?.checked_at ?? null,
          pick:
            picks.find((p) => p.game_id === g.id && p.user_id === ctx.user.id)
              ?.side ?? null,
        };
      }),
    );
    const members = (await db
      .prepare(
        "SELECT u.id,u.name FROM memberships m JOIN users u ON m.user_id=u.id WHERE m.pool_id=?",
      )
      .all(ctx.pool)) as {
      id: string;
      name: string;
    }[];
    const predictions = await db
      .prepare(
        "SELECT user_id,total FROM tiebreaker_predictions WHERE pool_id=? AND saturday=?",
      )
      .all(ctx.pool, ctx.date);
    const tiebreakerGame = games.find((g) => g.id === ctx.tiebreakerGameId);
    const actualTotal =
      tiebreakerGame?.completed &&
      tiebreakerGame.homePoints !== null &&
      tiebreakerGame.awayPoints !== null
        ? tiebreakerGame.homePoints + tiebreakerGame.awayPoints
        : null;
    const standings = members
      .map((member) => {
        const own = picks.filter((p) => p.user_id === member.id);
        const prediction = predictions.find((p) => p.user_id === member.id)
          ?.total as number | undefined;
        return {
          ...member,
          entered: own.length > 0,
          tiebreakerTotal:
            tiebreakerGame?.locked || member.id === ctx.user.id
              ? (prediction ?? null)
              : null,
          tiebreakerDistance:
            actualTotal !== null && prediction !== undefined
              ? Math.abs(prediction - actualTotal)
              : null,
          score: games.filter(
            (g) =>
              g.winner &&
              own.some((p) => p.game_id === g.id && p.side === g.winner),
          ).length,
          picks: own
            .filter(
              (p) =>
                p.user_id === ctx.user.id ||
                games.some((g) => g.id === p.game_id && g.locked),
            )
            .map((p) => ({ gameId: p.game_id, side: p.side })),
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          ((a.tiebreakerDistance ?? Infinity) ===
          (b.tiebreakerDistance ?? Infinity)
            ? 0
            : (a.tiebreakerDistance ?? Infinity) <
                (b.tiebreakerDistance ?? Infinity)
              ? -1
              : 1) ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      );
    const complete = games.every((g) => g.completed);
    res.json({
      viewerId: ctx.user.id,
      tiebreaker: tiebreakerGame
        ? {
            gameId: tiebreakerGame.id,
            locked: tiebreakerGame.locked,
            total:
              predictions.find((p) => p.user_id === ctx.user.id)?.total ?? null,
            actualTotal,
          }
        : null,
      serverTime: now(),
      games,
      feedUnavailable,
      standings: standings.map((row) => {
        const rank =
          1 +
          standings.filter(
            (r) =>
              r.entered &&
              (r.score > row.score ||
                (r.score === row.score &&
                  (r.tiebreakerDistance ?? Infinity) <
                    (row.tiebreakerDistance ?? Infinity))),
          ).length;
        const tied = standings.filter(
          (r) =>
            r.entered &&
            r.score === row.score &&
            r.tiebreakerDistance === row.tiebreakerDistance,
        ).length;
        const prizePercent =
          complete && row.entered
            ? ctx.prizePercentages
                .slice(rank - 1, rank - 1 + tied)
                .reduce((sum, p) => sum + p, 0) / tied
            : null;
        return { ...row, rank: row.entered ? rank : null, prizePercent };
      }),
      rules:
        "One point per outright winner. Each pick locks at its published kickoff. Tied games score zero. " +
        (tiebreakerGame
          ? "Tied players are ranked by the smallest difference from the tiebreaker game's final combined score, including overtime. Going over is allowed. Missing predictions rank after submitted predictions. Remaining ties share the combined prizes for their occupied places equally. "
          : "Tied players share a rank and split the combined prizes for their occupied places equally. ") +
        "Unresolved games remain pending.",
    });
  });
}
