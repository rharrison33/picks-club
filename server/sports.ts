import { suggestGames, type Game, type PollWeek } from "./selection.js";
import { chooseOdds, type BettingGame } from "./odds.js";
import { enrichGames, type Team, type TeamRecord } from "./team-details.js";

const cache = new Map<string, { expires: number; data: Promise<unknown[]> }>();
async function feed<T>(path: string, ttl: number, required = false): Promise<T[]> {
  const existing = cache.get(path);
  if (existing && existing.expires > Date.now()) return existing.data as Promise<T[]>;
  const data = (async () => {
    const key = process.env.CFBD_API_KEY;
    if (!key) throw new Error("CFBD_API_KEY is not configured.");
    const response = await fetch("https://api.collegefootballdata.com/" + path, {
      headers: { Authorization: "Bearer " + key }, signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("Sports data is temporarily unavailable.");
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid sports data response.");
    return payload as T[];
  })().catch((error) => {
    cache.delete(path);
    if (required) throw error;
    cache.set(path, { expires: Date.now() + 60_000, data: Promise.resolve([]) });
    return [] as T[];
  });
  cache.set(path, { expires: Date.now() + ttl, data });
  return data;
}

type CalendarWeek = { week: number; seasonType: string; startDate: string; endDate: string };
export function nextSaturday(timeZone = "America/Denver") {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = new Date(today + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + (6 - date.getUTCDay() + 7) % 7);
  return date.toISOString().slice(0, 10);
}
export function isSaturday(value: unknown): value is string {
  if (typeof value !== "string" || !/^20[2-9][0-9]-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 6;
}
export async function getSlate(saturday: string, playerFavorites: string[][], timezone: string) {
  const year = Number(saturday.slice(0, 4));
  const calendar = await feed<CalendarWeek>("calendar?year=" + year, 86400_000, true);
  const target = Date.parse(saturday + "T12:00:00Z");
  const week = calendar.find((w) => target >= Date.parse(w.startDate) && target <= Date.parse(w.endDate));
  if (!week) throw new Error("No college football week is available for this Saturday.");
  const query = new URLSearchParams({ year: String(year), week: String(week.week), seasonType: week.seasonType });
  const [rawGames, pollWeeks, teams, records, lines] = await Promise.all([
    feed<Game>("games?" + query, 5 * 60_000, true),
    feed<PollWeek>("rankings?year=" + year + "&seasonType=" + week.seasonType, 3600_000),
    feed<Team>("teams?year=" + year, 86400_000),
    feed<TeamRecord>("records?year=" + year, 15 * 60_000),
    feed<BettingGame>("lines?" + query, 15 * 60_000),
  ]);
  const latest = pollWeeks.filter((w) => (w.week ?? 0) <= week.week && w.polls.some((p) => p.poll === "AP Top 25" && p.ranks.length))
    .sort((a, b) => (b.week ?? 0) - (a.week ?? 0))[0];
  const rankings = latest ? [latest] : [];
  const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const games = rawGames.filter((g) => !g.startTimeTBD && Number.isFinite(Date.parse(g.startDate)) && dateFormatter.format(new Date(g.startDate)) === saturday);
  const lineMap = new Map(lines.map((g) => [g.id, g]));
  const enriched = enrichGames(games, rankings, teams, records).map((g) => ({ ...g, odds: chooseOdds(lineMap.get(g.id)) }));
  const suggestions = suggestGames(enriched, playerFavorites);
  // Keep the full slate for display, but fill the eight from games still open.
  suggestions.suggestedIds = suggestGames(enriched.filter((g) => Date.parse(g.startDate) > Date.now()), playerFavorites).suggestedIds;
  const priorities = new Map(suggestions.priorities.map((p) => [p.id, p]));
  return {
    games: enriched.map((g) => ({ ...g, recommendation: priorities.get(g.id)! })),
    ...suggestions, saturday, timezone, season: year, week: week.week,
    rankingWeek: latest?.week ?? null, rankingsAvailable: !!latest,
    recordsAvailable: records.length > 0, oddsAvailable: enriched.some((g) => g.odds !== null),
  };
}
export type Slate = Awaited<ReturnType<typeof getSlate>>;
export async function getTeamOptions() {
  const teams = await feed<Team>("teams?year=" + new Date().getUTCFullYear(), 86400_000, true);
  return [...new Set(teams.map((team) => team.school).filter((name) => typeof name === "string" && name.length > 0))].sort();
}

export type GameResult = { id: number; completed: boolean; homePoints: number | null; awayPoints: number | null };
export async function getResults(saturday: string): Promise<GameResult[]> {
  const year = Number(saturday.slice(0, 4));
  const calendar = await feed<CalendarWeek>("calendar?year=" + year, 86400_000, true);
  const target = Date.parse(saturday + "T12:00:00Z");
  const week = calendar.find((w) => target >= Date.parse(w.startDate) && target <= Date.parse(w.endDate));
  if (!week) throw new Error("Results unavailable.");
  const query = new URLSearchParams({ year: String(year), week: String(week.week), seasonType: week.seasonType });
  return feed<GameResult>("games?" + query, 5 * 60_000, true);
}

