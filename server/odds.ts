export type GameLine = {
  provider: string;
  spread: number | string | null;
  formattedSpread: string | null;
  overUnder: number | string | null;
  homeMoneyline: number | string | null;
  awayMoneyline: number | string | null;
};
export type BettingGame = { id: number; lines: GameLine[] };

function numeric(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function chooseOdds(game: BettingGame | undefined) {
  // One actual provider per game; do not blend moneylines from different books.
  const line = [...(game?.lines ?? [])].sort(
    (a, b) =>
      Number(numeric(b.spread) !== null) - Number(numeric(a.spread) !== null) ||
      a.provider.localeCompare(b.provider),
  )[0];
  if (!line) return null;
  return {
    provider: line.provider,
    spread: numeric(line.spread),
    formattedSpread: line.formattedSpread,
    total: numeric(line.overUnder),
    homeMoneyline: numeric(line.homeMoneyline),
    awayMoneyline: numeric(line.awayMoneyline),
  };
}

export type Odds = ReturnType<typeof chooseOdds>;
