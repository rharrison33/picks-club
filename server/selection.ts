import type { Odds } from "./odds.js";

export type Game = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  startDate: string;
  startTimeTBD: boolean;
};
export type PollWeek = {
  week?: number;
  polls: { poll: string; ranks: { school: string; rank: number }[] }[];
};
export type SelectionGame = Game & {
  home: { rank: number | null; state: string | null };
  away: { rank: number | null; state: string | null };
  odds: Odds;
};

export function suggestGames(games: SelectionGame[], playerFavorites: string[][] = []) {
  const priorities = games.map((game) => {
    const ranked = game.home.rank !== null || game.away.rank !== null;
    const bothRanked = game.home.rank !== null && game.away.rank !== null;
    const spread = game.odds?.spread;
    const margin = spread === null || spread === undefined ? null : Math.abs(spread);
    const mustWatch = ranked && margin !== null && margin <= 7;
    // Each member gets one vote per matchup, whether they picked one favorite or five.
    const affinity = playerFavorites.length === 0 ? 0 : playerFavorites.filter((teams) => teams.includes(game.homeTeam) || teams.includes(game.awayTeam)).length / playerFavorites.length;
    const bestRank = Math.min(game.home.rank ?? 26, game.away.rank ?? 26);
    const competitiveness = margin === null ? 0 : Math.max(0, 1 - margin / 21);
    const score = Math.round(affinity * 50 + competitiveness * 30
      + (ranked ? (26 - bestRank) / 25 * 15 : 0) + (bothRanked ? 5 : 0));
    const reasons = [
      ...(mustWatch ? ["Ranked + close spread"] : []),
      ...(affinity > 0 ? ["Pool favorite"] : []),
      ...(bothRanked ? ["Top 25 showdown"] : ranked ? ["AP-ranked team"] : []),
      ...(margin !== null && margin <= 7 && !mustWatch ? ["Close spread"] : []),
    ];
    return { id: game.id, mustWatch, score, bestRank, startDate: game.startDate,
      reasons: reasons.length ? reasons : ["Saturday matchup"] };
  }).sort((a, b) => Number(b.mustWatch) - Number(a.mustWatch) || b.score - a.score
    || a.bestRank - b.bestRank || Date.parse(a.startDate) - Date.parse(b.startDate) || a.id - b.id);

  return {
    suggestedIds: priorities.slice(0, 8).map((entry) => entry.id),
    priorities,
    selectionNote: "Ranked teams in games with a spread of 7 or less come first. Members' favorite teams, closer spreads, and AP rank decide the rest.",
  };
}

