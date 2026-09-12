import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestGames, type SelectionGame } from "./selection.js";
import { chooseOdds } from "./odds.js";
import { lineupOpen } from "./lineup-deadline.js";

test("lineup deadline is Friday midnight in the pool time zone", () => {
  assert.equal(lineupOpen("2026-09-19", "America/Denver", Date.parse("2026-09-14T16:59:59Z")), false);
  assert.equal(lineupOpen("2026-09-19", "America/Denver", Date.parse("2026-09-14T17:00:00Z")), true);
  assert.equal(lineupOpen("2026-09-26", "America/Denver", Date.parse("2026-09-14T17:00:00Z")), false);
  assert.equal(lineupOpen("2026-12-19", "America/Denver", Date.parse("2026-12-14T17:59:59Z")), false);
  assert.equal(lineupOpen("2026-12-19", "America/Denver", Date.parse("2026-12-14T18:00:00Z")), true);
  assert.equal(lineupOpen("2026-09-19", "America/Denver", Date.parse("2026-09-18T05:59:59Z")), true);
  assert.equal(lineupOpen("2026-09-19", "America/Denver", Date.parse("2026-09-18T06:00:00Z")), false);
  assert.equal(lineupOpen("2026-09-19", "America/Los_Angeles", Date.parse("2026-09-18T06:00:00Z")), true);
  assert.equal(lineupOpen("2026-09-19", "America/Denver", Date.parse("2026-09-19T18:00:00Z")), false);
  assert.equal(lineupOpen("2026-12-19", "America/Denver", Date.parse("2026-12-18T06:59:59Z")), true);
  assert.equal(lineupOpen("2026-12-19", "America/Denver", Date.parse("2026-12-18T07:00:00Z")), false);
});

function game(id: number, state = "CO", rank: number | null = null, spread: number | null = null): SelectionGame {
  return { id, homeTeam: `Home ${id}`, awayTeam: `Away ${id}`,
    startDate: "2026-09-19T18:00:00Z", startTimeTBD: false,
    home: { state, rank }, away: { state: "NY", rank: null },
    odds: spread === null ? null : { provider: "Test", spread, formattedSpread: null, total: 50, homeMoneyline: null, awayMoneyline: null } };
}

test("ranked close games precede even the most favorite-team games", () => {
  const games = [...Array.from({ length: 12 }, (_, i) => game(i + 1)), game(20, "FL", 25, -7)];
  assert.equal(suggestGames(games, [["Home 1"], ["Home 1"]]).suggestedIds[0], 20);
  assert.equal(suggestGames(games, [["Home 1"]]).suggestedIds.length, 8);
});
test("missing odds are not treated as a pick'em and seven is inclusive", () => {
  const result = suggestGames([game(1, "CO", 1), game(2, "CO", 1, 7), game(3, "CO", 1, 7.5), game(4, "CO", 1, 0)]);
  assert.equal(result.priorities.find((g) => g.id === 1)?.mustWatch, false);
  assert.equal(result.priorities.find((g) => g.id === 2)?.mustWatch, true);
  assert.equal(result.priorities.find((g) => g.id === 3)?.mustWatch, false);
  assert.equal(result.priorities.find((g) => g.id === 4)?.mustWatch, true);
});
test("pool membership weights favorite-team preferences independently", () => {
  const games = [game(1, "CO"), game(2, "FL")];
  assert.equal(suggestGames(games, [["Home 1"], ["Home 1"], ["Home 2"]]).suggestedIds[0], 1);
  assert.equal(suggestGames(games, [["Home 2"], ["Home 2"], ["Home 1"]]).suggestedIds[0], 2);
  assert.deepEqual(suggestGames(games, [["Home 1"]]), suggestGames([...games].reverse(), [["Home 1"]]));
  assert.deepEqual(suggestGames([], []).suggestedIds, []);
  assert.deepEqual(games.map((g) => g.id), [1, 2]);
});
test("odds parsing preserves zero and never converts missing data into zero", () => {
  assert.equal(chooseOdds(undefined), null);
  assert.equal(chooseOdds({ id: 1, lines: [] }), null);
  const odds = chooseOdds({ id: 1, lines: [{ provider: "Test", spread: "0", formattedSpread: "PK", overUnder: null, homeMoneyline: "-110", awayMoneyline: null }] });
  assert.equal(odds?.spread, 0);
  assert.equal(odds?.total, null);
  assert.equal(odds?.homeMoneyline, -110);
  assert.equal(odds?.awayMoneyline, null);
});

