import express from "express";

const apiKey = process.env.CFBD_API_KEY;

if (!apiKey) {
  throw new Error("CFBD_API_KEY is missing from the environment");
}

const app = express();

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

type Game = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  startDate: string;
  startTimeTBD: boolean;
};

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  timeZone: "America/Denver",
});

app.get("/api/games", async (_req, res) => {
  try {
    const response = await fetch(
      "https://api.collegefootballdata.com/games?year=2026&seasonType=regular&week=3",
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Sports API returned ${response.status}`);
    }

    const games = (await response.json()) as Game[];

    const saturdayGames = games.filter((game) => {
      if (game.startTimeTBD) return false;

      const kickoff = new Date(game.startDate);

      if (!Number.isFinite(kickoff.getTime())) return false;

      return weekdayFormatter.format(kickoff) === "Saturday";
    });

    saturdayGames.sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

    res.json(saturdayGames);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Could not fetch games",
    );

    res.status(502).json({ error: "Could not load games" });
  }
});

app.listen(3001, "127.0.0.1", () => {
  console.log("Server running at http://127.0.0.1:3001");
});
