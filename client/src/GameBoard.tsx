import { useState } from "react";
import type { Game, TeamDetails } from "./types";

function TeamRow({ team }: { team: TeamDetails }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className="team-row">
    <span className="team-logo">{team.logo && team.logo !== failed ? <img src={team.logo} alt="" loading="lazy" onError={() => setFailed(team.logo)} /> : <span aria-hidden="true">{team.name.slice(0,2).toUpperCase()}</span>}</span>
    <span className="team-info"><span className="team-name">{team.rank !== null && <span className="rank">#{team.rank}</span>}{team.name}</span><span className="team-meta">{team.conference ?? "College football"}</span></span>
    <span className="team-record" title="Current season record">{team.record ?? "—"}<small>Season</small></span>
  </span>;
}
const moneyline = (n: number | null) => n === null ? "—" : n > 0 ? "+" + n : String(n);
export default function GameBoard({ games, selectedIds = [], onToggle, timezone }: { games: Game[]; selectedIds?: number[]; onToggle?: (id: number) => void; timezone: string }) {
  const format = new Intl.DateTimeFormat("en-US", { weekday:"short", hour:"numeric", minute:"2-digit", timeZone:timezone, timeZoneName:"short" });
  return <ul className="game-list">{games.map((game) => <li key={game.id}>
    <label className={"game-option" + (!onToggle ? " read-only" : "")}>
      {onToggle && <input className="game-checkbox" aria-label={"Select " + game.awayTeam + " at " + game.homeTeam} type="checkbox" checked={selectedIds.includes(game.id)}
        onChange={() => onToggle(game.id)} />}
      <span className="game-card">
        <span className="card-header"><span>{game.home.rank && game.away.rank ? "TOP 25 SHOWDOWN" : "SATURDAY MATCHUP"}</span>{onToggle && <span className="game-check" aria-hidden="true">✓</span>}</span>
        <TeamRow team={game.away}/><span className="matchup-divider">AT</span><TeamRow team={game.home}/>
        <span className="odds-panel"><span><small>SPREAD</small>{game.odds?.formattedSpread || (game.odds?.spread != null ? game.homeTeam + " " + (game.odds.spread > 0 ? "+" : "") + game.odds.spread : "Unavailable")}</span><span><small>TOTAL</small>{game.odds?.total ?? "—"}</span></span>
        {game.odds && <span className="odds-source">{game.odds.provider} · Moneyline (away / home): {moneyline(game.odds.awayMoneyline)} / {moneyline(game.odds.homeMoneyline)}</span>}
        {onToggle && <span className="recommendation">{game.recommendation.reasons.join(" · ")}</span>}
        <span className="card-footer"><time dateTime={game.startDate}>{format.format(new Date(game.startDate))}</time><span>{onToggle ? selectedIds.includes(game.id) ? "IN YOUR EIGHT" : "ADD TO LINEUP" : "PUBLISHED GAME"}</span></span>
      </span>
    </label>
  </li>)}</ul>;
}
