import type { Contest, ContestGame } from "./Picks";
import type { ReactNode } from "react";

export default function SaturdayBoard({
  contest,
  error,
  notice,
  saving,
  timezone,
  onChoose,
  onRefresh,
  tiebreakerPanel,
}: {
  contest: Contest | null;
  error: string;
  notice: string;
  saving: number | null;
  timezone: string;
  onChoose: (game: ContestGame, side: "home" | "away") => void;
  onRefresh: () => void;
  tiebreakerPanel?: ReactNode;
}) {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  // Kickoff locks picks, but isn't proof a delayed game is actually in progress.
  const phase = (g: ContestGame) => (g.completed ? 2 : g.locked ? 0 : 1);
  const games = [...(contest?.games ?? [])].sort(
    (a, b) =>
      phase(a) - phase(b) ||
      Date.parse(a.startDate) - Date.parse(b.startDate) ||
      a.id - b.id,
  );
  const entrants = (contest?.standings ?? []).filter((r) => r.rank !== null);
  const top = entrants.slice(0, 5);
  const me = entrants.find((r) => r.id === contest?.viewerId);
  const finals = games.filter((g) => g.completed).length;
  const underway = games.filter((g) => g.locked && !g.completed).length;
  return (
    <section className="saturday-board">
      <header className="gameday-hero">
        <div>
          <p className="eyebrow">YOUR SATURDAY, ALL HERE</p>
          <h2>
            {finals === games.length && games.length
              ? "The results are in."
              : "Every game. Every pick."}
          </h2>
          <p>Follow the action and see how your circle stacks up.</p>
        </div>
        <a className="gameday-jump" href="#standings">
          View leaderboard ↓
        </a>
      </header>
      {error && (
        <p role="alert" className="error-banner">
          {error} {contest && "Showing the last loaded scores."}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="gameday-refresh">
        <p className="muted">
          Refreshes automatically. Scores may be delayed five minutes or more.{" "}
          {contest && `Last checked ${format.format(contest.serverTime)}.`}
        </p>
        <button onClick={onRefresh}>Refresh</button>
      </div>
      {!contest ? (
        <p role="status">
          {error
            ? "Scores could not be loaded. Try Refresh."
            : "Getting your Saturday ready…"}
        </p>
      ) : (
        <>
          {contest.feedUnavailable && (
            <p role="status" className="error-banner">
              The score feed is unavailable. Showing saved results; scores may
              be delayed.
            </p>
          )}
          <div className="gameday-stats">
            <div>
              <span>Your place</span>
              <strong>{me ? `#${me.rank}` : "Not entered"}</strong>
              <small>
                {me
                  ? `${me.score} correct · ${games.filter((g) => g.pick).length}/${games.length} picks saved`
                  : "Save a pick before kickoff to join in"}
              </small>
            </div>
            <div>
              <span>After kickoff</span>
              <strong>{underway}</strong>
              <small>Awaiting final results</small>
            </div>
            <div>
              <span>Games final</span>
              <strong>
                {finals}
                <small> / {games.length}</small>
              </strong>
              <small>Standings score final games only</small>
            </div>
          </div>
          <div className="gameday-layout">
            <div className="gameday-games">
              {tiebreakerPanel}
              <h3 id="gameday-games">On the field</h3>
              {!games.length && (
                <p className="panel">No games in this week's lineup yet.</p>
              )}
              {games.map((g) => (
                <article
                  className={`panel gameday-card ${g.locked && !g.completed ? "game-underway" : ""}`}
                  key={g.id}
                >
                  <div className="pick-heading">
                    <span className="status-pill">
                      {g.completed
                        ? "Final"
                        : g.locked
                          ? g.homePoints !== null && g.awayPoints !== null
                            ? "After kickoff · latest scores"
                            : "Awaiting score update"
                          : "Upcoming"}
                    </span>
                    <time dateTime={g.startDate}>
                      {format.format(new Date(g.startDate))}
                    </time>
                  </div>
                  <div className="gameday-scoreboard">
                    {(["away", "home"] as const).map((side) => (
                      <div
                        className={`gameday-team ${g.pick === side ? "my-team" : ""}`}
                        key={side}
                      >
                        {g[side].logo ? (
                          <img src={g[side].logo} alt="" />
                        ) : (
                          <span className="team-initial">
                            {g[side].name.slice(0, 1)}
                          </span>
                        )}
                        <div>
                          <strong>
                            {g[side].rank ? `#${g[side].rank} ` : ""}
                            {g[side].name}
                          </strong>
                          <small>
                            {g[side].record ?? "Record unavailable"}
                            {g.pick === side ? " · Your pick" : ""}
                          </small>
                        </div>
                        <b>
                          {(side === "home" ? g.homePoints : g.awayPoints) ??
                            "—"}
                        </b>
                      </div>
                    ))}
                  </div>
                  <p className="gameday-your-pick">
                    <strong>
                      {g.pick
                        ? `Your pick: ${g.pick === "home" ? g.homeTeam : g.awayTeam}`
                        : g.locked
                          ? "No pick saved"
                          : "You still have time to pick"}
                    </strong>
                    <span>
                      {g.completed
                        ? g.pick && g.winner === g.pick
                          ? "+1 point"
                          : "0 points"
                        : g.locked
                          ? "Locked"
                          : "Open until kickoff"}
                    </span>
                  </p>
                  {!g.locked && (
                    <div className="action-row">
                      {(["away", "home"] as const).map((side) => (
                        <button
                          key={side}
                          aria-pressed={g.pick === side}
                          disabled={saving !== null}
                          onClick={() => onChoose(g, side)}
                        >
                          {saving === g.id ? "Saving…" : `Pick ${g[side].name}`}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="leaders-picks">
                    <h4>Who the top five picked</h4>
                    <p className="muted">
                      Current standings · ties ordered by name. Picks reveal at
                      kickoff.
                    </p>
                    {!top.length ? (
                      <p>No players have entered yet.</p>
                    ) : (
                      <ul>
                        {top.map((player) => {
                          const pick = player.picks.find(
                            (p) => p.gameId === g.id,
                          );
                          const visible =
                            g.locked || player.id === contest.viewerId;
                          return (
                            <li key={player.id}>
                              <span>
                                <small>#{player.rank}</small> {player.name}
                                {player.id === contest.viewerId ? " (you)" : ""}
                              </span>
                              <strong>
                                {!visible
                                  ? "Hidden until kickoff"
                                  : pick
                                    ? pick.side === "home"
                                      ? g.homeTeam
                                      : g.awayTeam
                                    : "No pick"}
                              </strong>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <aside className="panel gameday-leaderboard" id="standings">
              <a className="gameday-jump" href="#gameday-games">
                Back to games ↑
              </a>
              <p className="eyebrow">THE CIRCLE</p>
              <h3>Leaderboard</h3>
              <p className="muted">
                {finals} of {games.length} games final · {entrants.length}{" "}
                players entered
              </p>
              <ol>
                {entrants.map((row) => (
                  <li
                    key={row.id}
                    className={row.id === contest.viewerId ? "is-you" : ""}
                  >
                    <strong>#{row.rank}</strong>
                    <span>
                      {row.name}
                      {row.id === contest.viewerId && <small>You</small>}
                    </span>
                    <b>
                      {row.score}
                      <small> pts</small>
                      {row.tiebreakerDistance !== null && (
                        <small className="tie-result">
                          TB: {row.tiebreakerTotal} · off by{" "}
                          {row.tiebreakerDistance}
                        </small>
                      )}
                      {row.prizePercent !== null && (
                        <small className="tie-result">
                          {row.prizePercent.toFixed(2)}% prize share
                        </small>
                      )}
                    </b>
                  </li>
                ))}
              </ol>
              {!entrants.length && (
                <p>
                  No entries yet. The leaderboard starts with the first saved
                  pick.
                </p>
              )}
              <p className="muted">{contest.rules}</p>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
