import { useEffect, useRef, useState } from "react";
import { api, dollars, messageOf, parseFee } from "./api";
import GameBoard from "./GameBoard";
import { lineupOpen } from "./lineup-deadline";
import Picks from "./Picks";
import EntryAmount from "./EntryAmount";
import type { Pool, Slate, Week } from "./types";

function upcomingSaturday(timezone: string) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = new Date(today + "T12:00:00Z");

  date.setUTCDate(date.getUTCDate() + ((6 - date.getUTCDay() + 7) % 7));

  return date.toISOString().slice(0, 10);
}
export default function PoolView({
  pool,
  onUpdate,
}: {
  pool: Pool;
  onUpdate: (pool: Pool) => void;
}) {
  const organizer = pool.role === "organizer";
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const [preview, setPreview] = useState(false);
  const [view, setView] = useState<"day" | "manage" | null>(null);
  const requested = new URLSearchParams(location.search).get("week");
  const date =
    !organizer &&
    requested &&
    /^20[2-9][0-9]-\d{2}-\d{2}$/.test(requested) &&
    new Date(requested + "T12:00:00Z").getUTCDay() === 6
      ? requested
      : upcomingSaturday(pool.timezone);
  const windowOpen = lineupOpen(date, pool.timezone, clock);
  const [revision, setRevision] = useState(0);
  const [week, setWeek] = useState<Week | null>(null);
  const [slate, setSlate] = useState<Slate | null>(null);
  const [ids, setIds] = useState<number[]>([]);
  const [gameCount, setGameCount] = useState(8);
  const [tiebreakerGameId, setTiebreakerGameId] = useState<number | null>(null);
  const selectedTiebreaker =
    tiebreakerGameId !== null && ids.includes(tiebreakerGameId)
      ? tiebreakerGameId
      : null;
  const [newSelection, setNewSelection] = useState<number | null>(null);
  const selectionPrompt = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ids.length > gameCount) {
      selectionPrompt.current?.focus({ preventScroll: true });
      selectionPrompt.current?.scrollIntoView({ block: "center" });
    }
  }, [ids.length, newSelection, gameCount]);
  const [amount, setAmount] = useState("");
  const [sort, setSort] = useState("pool");
  const [teamSearch, setTeamSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const base = "/pools/" + pool.id;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const r = await api<{ week: Week }>(base + "/weeks/" + date, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setWeek(r.week);
        setAmount((r.week.feeCents / 100).toFixed(2));
        setIds(r.week.games.map((g) => g.id));
        setGameCount(r.week.gameCount);
        setTiebreakerGameId(r.week.tiebreakerGameId);
        if (organizer && !r.week.published && windowOpen) {
          const data = await api<Slate>(base + "/games?date=" + date, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setSlate(data);
          if (!r.week.saved)
            setIds(
              data.suggestedIds.filter((id) =>
                data.games.some(
                  (g) => g.id === id && Date.parse(g.startDate) > Date.now(),
                ),
              ),
            );
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(messageOf(e));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [base, date, organizer, revision, pool.timezone, windowOpen]);
  function reload() {
    setLoading(true);
    setWeek(null);
    setSlate(null);
    setError("");
    setNotice("");
    setRevision((v) => v + 1);
  }
  async function save(publish: boolean) {
    if (!lineupOpen(date, pool.timezone)) {
      setError(
        "Lineup selection is open Sunday at noon through Thursday night.",
      );
      return;
    }
    if (ids.length > gameCount) {
      setError(
        `Deselect ${ids.length - gameCount} game${ids.length - gameCount === 1 ? "" : "s"} before saving or publishing.`,
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<{ week: Week }>(base + "/weeks/" + date, {
        method: "PUT",
        body: JSON.stringify({
          feeCents: parseFee(amount),
          gameIds: ids,
          gameCount,
          tiebreakerGameId: selectedTiebreaker,
          publish,
        }),
      });
      setWeek(r.week);
      setNotice(
        publish
          ? "Week published. Everyone in the pool can now see the lineup and entry amount."
          : "Draft saved.",
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function change(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<{ pool: Pool }>(base + path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      onUpdate(r.pool);
      setNotice("Pool updated.");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  function settings(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      void change("", "PATCH", {
        name: data.get("name"),
        defaultFeeCents: parseFee(String(data.get("amount"))),
        venmoUrl: String(data.get("venmoUrl") ?? ""),
        prizePercentages: String(data.get("prizes"))
          .split(",")
          .map((v) => Number(v.trim())),
      });
    } catch (e) {
      setError(messageOf(e));
    }
  }
  const manage = organizer && !preview;
  const games = week?.published ? week.games : (slate?.games ?? []);
  const ordered = [...games].sort(
    (a, b) =>
      Number(b.recommendation.mustWatch) - Number(a.recommendation.mustWatch) ||
      b.recommendation.score - a.recommendation.score ||
      a.id - b.id,
  );
  const organizers = pool.members.filter((m) => m.role === "organizer").length;
  const query = teamSearch.trim().toLowerCase();
  const editingLineup = manage && !week?.published && windowOpen;
  const remaining = ordered.filter((game) => !ids.includes(game.id));
  const visibleGames = editingLineup
    ? query
      ? remaining.filter((game) =>
          [game.homeTeam, game.awayTeam].some((name) =>
            name.toLowerCase().includes(query),
          ),
        )
      : remaining.slice(0, 30)
    : ordered;
  if (sort === "rank")
    visibleGames.sort(
      (a, b) =>
        Math.min(a.home.rank ?? 999, a.away.rank ?? 999) -
          Math.min(b.home.rank ?? 999, b.away.rank ?? 999) || a.id - b.id,
    );
  const selectedGames = ids.flatMap((id) =>
    games.filter((game) => game.id === id),
  );
  const saturdayToday =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: pool.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(clock) === date;
  const showGameDay =
    week?.published && (view === "day" || (view === null && saturdayToday));
  const viewSwitch = week?.published && (
    <div className="view-tabs" aria-label="Pool view">
      <button
        aria-pressed={Boolean(showGameDay)}
        onClick={() => setView("day")}
      >
        Game day
      </button>
      <button aria-pressed={!showGameDay} onClick={() => setView("manage")}>
        {organizer ? "Picks & pool settings" : "Picks & pool details"}
      </button>
    </div>
  );
  if (showGameDay)
    return (
      <>
        <div className="pool-title">
          <div>
            <p className="eyebrow">SATURDAY AT THE CLUB · {date}</p>
            <h2>{pool.name}</h2>
          </div>
          <span className="role-badge">{pool.role}</span>
        </div>
        {viewSwitch}
        <Picks
          key={pool.id + date}
          poolId={pool.id}
          date={date}
          timezone={pool.timezone}
          gameDay
        />
      </>
    );
  return (
    <>
      <div className="pool-title">
        <div>
          <p className="eyebrow">
            {pool.members.length} MEMBERS ·{" "}
            {pool.timezone.replace("America/", "").replaceAll("_", " ")}
          </p>
          <h2>{pool.name}</h2>
        </div>
        <span className="role-badge">{pool.role}</span>
      </div>
      {viewSwitch}
      {organizer && (
        <div className="view-tabs">
          <button aria-pressed={!preview} onClick={() => setPreview(false)}>
            Organizer view
          </button>
          <button aria-pressed={preview} onClick={() => setPreview(true)}>
            Player preview
          </button>
        </div>
      )}
      <section className="panel week-toolbar">
        <div>
          <strong>Saturday, {date}</strong>
          <p className="muted">
            Lineup selection: Sunday noon through Thursday midnight ·{" "}
            {pool.timezone.replaceAll("_", " ")}
          </p>
        </div>
        <span className="status-pill">
          {week?.published
            ? "Published · locked"
            : windowOpen
              ? "Selection open"
              : "Selection closed"}
        </span>
        <button disabled={busy || loading} onClick={() => reload()}>
          Refresh
        </button>
      </section>
      {organizer && !windowOpen && (
        <section className="panel">
          <h3>Lineup selection is closed</h3>
          <p>
            Weekly matchups open Sunday at noon in your pool's time zone,
            allowing time for spreads to become available. Finalize your lineup
            by Thursday night at midnight (00:00 Friday).
          </p>
          <p className="muted">
            Published games and player picks remain available below. Some
            spreads may still be unavailable when selection opens.
          </p>
        </section>
      )}
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
      {loading && <p role="status">Loading this Saturday…</p>}
      {!loading && week && (
        <>
          {editingLineup ? (
            <section className="panel weekly-editor">
              <div>
                <p className="eyebrow">BUILD THIS WEEK</p>
                <h3>
                  {ids.length} / {gameCount} games selected
                </h3>
                <p className="muted">
                  Suggestions favor ranked, close matchups and your members'
                  favorite teams. Adjust the lineup before publishing.
                </p>
              </div>
              <fieldset disabled={busy}>
                <label>
                  Number of games
                  <select
                    value={gameCount}
                    onChange={(e) => setGameCount(Number(e.target.value))}
                  >
                    {[6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <option key={n} value={n}>
                        {n} games
                      </option>
                    ))}
                  </select>
                </label>
                <EntryAmount value={amount} onChange={setAmount} />
                <label>
                  Tiebreaker game
                  <select
                    value={selectedTiebreaker ?? ""}
                    onChange={(e) =>
                      setTiebreakerGameId(
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                  >
                    <option value="">Choose one of your selected games</option>
                    {selectedGames.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.awayTeam} at {g.homeTeam}
                      </option>
                    ))}
                  </select>
                </label>
                <small>
                  Players predict the combined final score, including overtime.
                  Closest total breaks ties; equal differences split the tied
                  prizes evenly. Choose a tiebreaker before publishing.
                </small>
              </fieldset>
              <p className="muted">
                Prize split:{" "}
                {pool.prizePercentages
                  .map((p, i) => `#${i + 1}: ${p}%`)
                  .join(" · ")}
                . Change this in pool settings before publishing.
              </p>
              <div className="action-row">
                <button
                  disabled={busy || !slate}
                  onClick={() =>
                    setIds(
                      ordered
                        .filter((g) => Date.parse(g.startDate) > Date.now())
                        .slice(0, gameCount)
                        .map((g) => g.id),
                    )
                  }
                >
                  Use suggested {gameCount}
                </button>
                <button
                  disabled={busy || ids.length > gameCount}
                  onClick={() => save(false)}
                >
                  Save draft
                </button>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    ids.length !== gameCount ||
                    selectedTiebreaker === null
                  }
                  onClick={() => save(true)}
                >
                  {busy ? "Saving…" : "Publish week"}
                </button>
              </div>
              <small>
                Finalize and publish by Thursday night at midnight (00:00
                Friday), {pool.timezone.replaceAll("_", " ")}. Publishing locks
                the games and amount for this week.
              </small>
            </section>
          ) : (
            <section className="panel entry-summary">
              <div>
                <p className="eyebrow">
                  {week.published ? "THIS WEEK'S ENTRY" : "PLANNED ENTRY"}
                </p>
                <strong>
                  {dollars(week.feeCents)} <small>per player</small>
                </strong>
              </div>
              <p>
                {week.published
                  ? "The lineup is ready. Save your picks below. Payments are not collected in this version."
                  : "Your organizers are putting this Saturday together. The lineup and amount are final once published."}
              </p>
            </section>
          )}
          {week.published && (
            <p className="muted">
              Published prize split:{" "}
              {week.prizePercentages
                .map((p, i) => `#${i + 1}: ${p}%`)
                .join(" · ")}
              . No platform fee. No payment has been collected by this app.
            </p>
          )}
          {pool.venmoUrl && (
            <section className="panel">
              <h3>Organizer payment link</h3>
              <a
                className="external-payment"
                href={pool.venmoUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Venmo
              </a>
              <p className="muted">
                Verify the recipient and amount in Venmo. Picks Club does not
                confirm or process this payment.
              </p>
            </section>
          )}
          {week.published && (
            <Picks
              key={pool.id + date}
              poolId={pool.id}
              date={date}
              timezone={pool.timezone}
            />
          )}
          {(editingLineup || week.published) && (
            <>
              <div className="board-heading">
                <h3>
                  {week.published
                    ? `This week's ${week.games.length} games`
                    : "Saturday lineup"}
                </h3>
                {editingLineup && (
                  <label>
                    Sort
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="pool">Best for this pool</option>
                      <option value="rank">AP rank</option>
                    </select>
                  </label>
                )}
              </div>
              {!games.length && (
                <p className="panel">
                  No games available for this Saturday. Try another Saturday or
                  refresh later.
                </p>
              )}
              {editingLineup && games.length > 0 && (
                <div className="lineup-search">
                  <label>
                    Find a matchup
                    <input
                      type="search"
                      value={teamSearch}
                      onChange={(e) => setTeamSearch(e.target.value)}
                      placeholder="Search either team name"
                      autoComplete="off"
                    />
                  </label>
                  {teamSearch && (
                    <button type="button" onClick={() => setTeamSearch("")}>
                      Clear search
                    </button>
                  )}
                  <p className="muted" role="status">
                    {query
                      ? `${visibleGames.length} unselected matches across all ${games.length} games`
                      : `Top ${visibleGames.length} remaining recommendations`}
                    . Selected games are in your lineup.
                  </p>
                  {visibleGames.length === 0 && (
                    <p>
                      {query
                        ? `No unselected matchups found for “${teamSearch.trim()}”. Check your lineup or try another team.`
                        : "All available games are in your lineup."}
                    </p>
                  )}
                </div>
              )}
              {editingLineup && ids.length > gameCount && (
                <div
                  ref={selectionPrompt}
                  tabIndex={-1}
                  className="registration-checklist lineup-overflow"
                  role="alert"
                >
                  <strong>
                    {ids.length} games selected — deselect{" "}
                    {ids.length - gameCount} to get back to {gameCount}.
                  </strong>
                  <p>
                    Your new matchup is selected. Choose an existing game to
                    remove, or cancel the new selection.
                  </p>
                  {newSelection !== null && ids.includes(newSelection) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setIds((current) =>
                          current.filter((id) => id !== newSelection),
                        );
                        setNewSelection(null);
                      }}
                    >
                      Cancel new selection
                    </button>
                  )}
                  <div className="favorite-chips">
                    {games
                      .filter(
                        (game) =>
                          ids.includes(game.id) && game.id !== newSelection,
                      )
                      .map((game) => (
                        <button
                          key={game.id}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setIds((current) =>
                              current.filter((id) => id !== game.id),
                            )
                          }
                          aria-label={`Remove ${game.awayTeam} at ${game.homeTeam}`}
                        >
                          Remove {game.awayTeam} at {game.homeTeam}
                        </button>
                      ))}
                  </div>
                </div>
              )}
              <div className={editingLineup ? "lineup-workspace" : undefined}>
                <div className="lineup-options">
                  <GameBoard
                    games={visibleGames}
                    selectedIds={ids}
                    timezone={pool.timezone}
                    onToggle={
                      editingLineup && !busy
                        ? (id) => {
                            if (
                              !ids.includes(id) &&
                              games.some(
                                (g) =>
                                  g.id === id &&
                                  Date.parse(g.startDate) <= Date.now(),
                              )
                            ) {
                              setError(
                                "That game has already started. Choose a matchup that has not kicked off yet.",
                              );
                              return;
                            }
                            setError("");
                            if (!ids.includes(id)) setNewSelection(id);
                            setIds((current) =>
                              current.includes(id)
                                ? current.filter((value) => value !== id)
                                : [...current, id],
                            );
                          }
                        : undefined
                    }
                  />
                </div>
                {editingLineup && (
                  <aside
                    className="panel selected-lineup"
                    aria-label="Selected lineup"
                  >
                    <h3>
                      Your lineup{" "}
                      <span>
                        {ids.length}/{gameCount}
                      </span>
                    </h3>
                    <p className="muted">
                      Remove a matchup to return it to the available options.
                    </p>
                    {selectedGames.length === 0 && (
                      <p>
                        Choose games from the recommendations or search for a
                        team.
                      </p>
                    )}
                    <ul>
                      {selectedGames.map((game) => (
                        <li key={game.id}>
                          <div>
                            <strong>
                              {game.away.rank ? `#${game.away.rank} ` : ""}
                              {game.awayTeam}
                            </strong>
                            <small>at</small>
                            <strong>
                              {game.home.rank ? `#${game.home.rank} ` : ""}
                              {game.homeTeam}
                            </strong>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`Remove ${game.awayTeam} at ${game.homeTeam} from lineup`}
                            onClick={() =>
                              setIds((current) =>
                                current.filter((id) => id !== game.id),
                              )
                            }
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </aside>
                )}
              </div>
            </>
          )}
        </>
      )}
      {manage && (
        <details className="panel organizer-settings">
          <summary>Pool settings & invitations</summary>
          <form
            className="stack-form"
            onSubmit={settings}
            key={
              pool.name + pool.defaultFeeCents + pool.prizePercentages.join(",")
            }
          >
            <fieldset disabled={busy}>
              <label>
                Pool name
                <input
                  name="name"
                  defaultValue={pool.name}
                  minLength={2}
                  maxLength={80}
                  required
                />
              </label>
              <EntryAmount initial={(pool.defaultFeeCents / 100).toFixed(2)} />
              <label>
                Prize percentages, by place
                <input
                  name="prizes"
                  defaultValue={pool.prizePercentages.join(", ")}
                  required
                  placeholder="70, 20, 10"
                />
              </label>
              <small>
                Comma-separated percentages totaling 100. One value of 100 means
                winner takes all. Ties combine the occupied places and split
                those percentages equally.
              </small>
              <label>
                Organizer Venmo link
                <input
                  name="venmoUrl"
                  type="url"
                  defaultValue={pool.venmoUrl}
                  placeholder="https://venmo.com/your-profile"
                />
              </label>
              <small>
                Opening Venmo does not confirm payment in Picks Club.
              </small>
              <small>
                Applies to new weeks. Existing drafts and published weeks keep
                their own amounts.
              </small>
              <button>Save pool settings</button>
            </fieldset>
          </form>
          <label className="invite-label">
            Invitation code
            <input
              readOnly
              value={pool.inviteCode ?? ""}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <div className="action-row">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(pool.inviteCode ?? "");
                  setNotice("Invitation code copied.");
                } catch {
                  setError("Select and copy the invitation code above.");
                }
              }}
            >
              Copy code
            </button>
            <button disabled={busy} onClick={() => change("/invite", "POST")}>
              Replace invitation code
            </button>
          </div>
          <small>
            Anyone with this code can join. Replacing it disables the old code.
          </small>
        </details>
      )}
      <section className="panel member-panel">
        <h3>
          The circle <small>{organizers}/2 organizers</small>
        </h3>
        <ul className="member-list">
          {pool.members.map((m) => (
            <li key={m.id}>
              <div>
                {m.photoUrl && (
                  <img className="member-avatar" src={m.photoUrl} alt="" />
                )}
                <strong>{m.name}</strong>
                <span>{m.role}</span>
                {organizer && m.venmoUrl && (
                  <a
                    href={m.venmoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Venmo for {m.name}
                  </a>
                )}
              </div>
              {manage && (
                <button
                  disabled={
                    busy ||
                    (m.role === "organizer"
                      ? organizers === 1
                      : organizers === 2)
                  }
                  onClick={() =>
                    change("/members/" + m.id, "PATCH", {
                      role: m.role === "organizer" ? "player" : "organizer",
                    })
                  }
                >
                  {m.role === "organizer" ? "Make player" : "Make organizer"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
