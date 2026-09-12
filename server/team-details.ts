import type { Game, PollWeek } from "./selection.js";

export type Team = {
  school: string;
  logos: string[] | null;
  conference: string | null;
  location?: { state?: string | null };
};
export type TeamRecord = {
  team: string;
  total: { wins: number; losses: number; ties: number };
};

export function enrichGames(
  games: Game[],
  polls: PollWeek[],
  teams: Team[],
  records: TeamRecord[],
) {
  const ranks = new Map(
    polls
      .flatMap((week) => week.polls)
      .find((poll) => poll.poll === "AP Top 25")
      ?.ranks.map((rank) => [rank.school, rank.rank]),
  );
  const teamMap = new Map(teams.map((team) => [team.school, team]));
  const recordMap = new Map(
    records.map((record) => [record.team, record.total]),
  );
  function details(name: string) {
    const team = teamMap.get(name);
    const record = recordMap.get(name);
    return {
      name,
      rank: ranks.get(name) ?? null,
      logo: team?.logos?.find((url) => url.startsWith("https://")) ?? null,
      conference: team?.conference ?? null,
      state: team?.location?.state ?? null,
      record: record
        ? `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}`
        : null,
    };
  }
  return games
    .map((game) => ({
      ...game,
      home: details(game.homeTeam),
      away: details(game.awayTeam),
    }))
    .sort((a, b) => {
      // #1 first, then #2, etc.; unranked games follow ranked games.
      const best = (game: typeof a) =>
        Math.min(game.home.rank ?? 999, game.away.rank ?? 999);
      const second = (game: typeof a) =>
        Math.max(game.home.rank ?? 999, game.away.rank ?? 999);
      return (
        best(a) - best(b) ||
        second(a) - second(b) ||
        Date.parse(a.startDate) - Date.parse(b.startDate) ||
        a.id - b.id
      );
    });
}
