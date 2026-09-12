import { useEffect, useRef, useState } from "react";
import { api, messageOf } from "./api";
import type { Game } from "./types";
type ContestGame = Game & {
  locked: boolean;
  completed: boolean;
  winner: "home" | "away" | null;
  pick: "home" | "away" | null;
  homePoints: number | null;
  awayPoints: number | null;
  checkedAt: number | null;
};
type Contest = {
  serverTime: number;
  games: ContestGame[];
  feedUnavailable: boolean;
  rules: string;
  standings: {
    id: string;
    name: string;
    rank: number | null;
    score: number;
    prizePercent: number | null;
    picks: { gameId: number; side: string }[];
  }[];
};
export default function Picks({
  poolId,
  date,
  timezone,
}: {
  poolId: string;
  date: string;
  timezone: string;
}) {
  const [contest, setContest] = useState<Contest | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const scrolled = useRef(false);
  useEffect(() => {
    if (contest && !scrolled.current && location.hash === "#standings") {
      document.getElementById("standings")?.scrollIntoView();
      scrolled.current = true;
    }
  }, [contest]);
  const base = "/pools/" + poolId + "/weeks/" + date;
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const data = await api<Contest>(base + "/contest", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setContest(data);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(messageOf(e));
      } finally {
        pending = false;
      }
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [base, revision]);
  async function choose(game: ContestGame, side: "home" | "away") {
    setSaving(game.id);
    setError("");
    setNotice("");
    try {
      await api(base + "/picks", {
        method: "PUT",
        body: JSON.stringify({ gameId: game.id, side }),
      });
      setContest((current) =>
        current
          ? {
              ...current,
              games: current.games.map((g) =>
                g.id === game.id ? { ...g, pick: side } : g,
              ),
            }
          : current,
      );
      setNotice(
        "Saved: " + (side === "home" ? game.homeTeam : game.awayTeam) + ".",
      );
      setRevision((v) => v + 1);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSaving(null);
    }
  }
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return (
    <section className="picks-section">
      <div className="board-heading">
        <h3>
          Your picks{" "}
          {contest && (
            <small>{contest.games.filter((g) => g.pick).length}/8 saved</small>
          )}
        </h3>
        <button onClick={() => setRevision((v) => v + 1)}>
          Refresh results
        </button>
      </div>
      <p className="muted">
        Tap a team to save your pick. You can change it until that game's
        published kickoff. No separate submit step.
      </p>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!contest && !error && <p role="status">Loading picks…</p>}
      {contest && (
        <>
          {contest.feedUnavailable && (
            <p role="status" className="error-banner">
              The results feed is unavailable. Showing the last saved results;
              scores may be delayed.
            </p>
          )}
          <ul className="pick-list">
            {contest.games.map((g) => (
              <li className="panel" key={g.id}>
                <div className="pick-heading">
                  <time>{format.format(new Date(g.startDate))}</time>
                  <strong>
                    {g.completed
                      ? "Final"
                      : g.locked
                        ? "Locked · awaiting final"
                        : "Open"}
                  </strong>
                </div>
                <div className="pick-teams">
                  {(["away", "home"] as const).map((side) => (
                    <button
                      key={side}
                      className={g.pick === side ? "chosen" : ""}
                      aria-pressed={g.pick === side}
                      disabled={g.locked || saving !== null}
                      onClick={() => choose(g, side)}
                    >
                      {g[side].logo && <img src={g[side].logo} alt="" />}
                      <span>
                        {g[side].rank && <small>#{g[side].rank} </small>}
                        {g[side].name}
                      </span>
                      <strong>
                        {side === "home" ? g.homePoints : g.awayPoints}
                      </strong>
                    </button>
                  ))}
                </div>
                <small>
                  {saving === g.id
                    ? "Saving…"
                    : g.pick
                      ? "Your pick: " +
                        (g.pick === "home" ? g.homeTeam : g.awayTeam)
                      : g.locked
                        ? "No pick saved · 0 points"
                        : "Choose your winner"}
                  {g.completed && g.pick
                    ? g.winner === g.pick
                      ? " · +1 point"
                      : " · 0 points"
                    : ""}
                </small>
              </li>
            ))}
          </ul>
          <section className="panel" id="standings">
            <h3>Weekly standings</h3>
            <p className="muted">{contest.rules}</p>
            <ol className="standings">
              {contest.standings.map((row) => (
                <li key={row.id}>
                  <strong>
                    {row.rank === null ? "Not entered" : "#" + row.rank}
                  </strong>
                  <span>{row.name}</span>
                  <strong>
                    {row.score} pts
                    {row.prizePercent !== null && (
                      <small>
                        {" "}
                        · {row.prizePercent.toFixed(2)}% prize share
                      </small>
                    )}
                  </strong>
                </li>
              ))}
            </ol>
            <small>
              Prize shares are projections based on saved picks, not payment
              confirmations. Standings update from completed games. Results
              refresh periodically while this page is open. Unresolved or
              postponed games stay pending for review.
            </small>
          </section>
        </>
      )}
    </section>
  );
}
