import type { Database } from "./database.js";

// Reserve before contacting a paid provider. Failed/ambiguous sends still count.
// Stored in Postgres, so deployment/restarts do not reset the allowance.
export async function reserveUsage(
  db: Database,
  limits: { scope: string; period: string; limit: number }[],
) {
  await db.transaction(async () => {
    for (const { scope, period, limit } of limits) {
      const row = await db
        .prepare(
          `INSERT INTO outbound_usage(scope,period,used) VALUES (?,?,1)
        ON CONFLICT(scope,period) DO UPDATE SET used=outbound_usage.used+1
        WHERE outbound_usage.used < ? RETURNING used`,
        )
        .get(scope, period, limit);
      if (!row)
        throw Object.assign(
          new Error("Service usage limit reached. Please try again later."),
          { status: 503 },
        );
    }
    // ISO dates/months sort chronologically; keep the current and previous month.
    const cutoff = new Date();
    cutoff.setUTCDate(1);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 1);
    await db
      .prepare("DELETE FROM outbound_usage WHERE period < ?")
      .run(cutoff.toISOString().slice(0, 7));
  });
}
