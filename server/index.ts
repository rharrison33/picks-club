import { createApp } from "./app.js";
import { openDatabase } from "./database.js";
import { pollSaturdayUpdates } from "./sms.js";
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.APP_ORIGIN?.startsWith("https://") ||
    !process.env.RESEND_API_KEY ||
    !process.env.EMAIL_FROM ||
    !process.env.DATABASE_URL)
) {
  throw new Error(
    "Production requires HTTPS APP_ORIGIN, RESEND_API_KEY, EMAIL_FROM, and DATABASE_URL.",
  );
}
const db = await openDatabase();
const app = createApp(db);
let polling = false;
const poll = async () => {
  if (polling) return;
  polling = true;
  try {
    await pollSaturdayUpdates(db);
  } catch {
    console.error("Saturday result update failed.");
  } finally {
    polling = false;
  }
};
const resultTimer = setInterval(() => {
  void poll();
}, 5 * 60000);
resultTimer.unref();
void poll();
const port = Number(process.env.PORT ?? 3001);
const server = app.listen(
  port,
  process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
  () => {
    console.log("Picks Club API running on port " + port);
  },
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    clearInterval(resultTimer);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
