import { useState } from "react";
import { api, messageOf } from "./api";
import type { Contest } from "./Picks";

export default function Tiebreaker({
  contest,
  base,
  onSaved,
}: {
  contest: Contest;
  base: string;
  onSaved: () => void;
}) {
  const tie = contest.tiebreaker;
  const game = contest.games.find((g) => g.id === tie?.gameId);
  const [draft, setDraft] = useState(String(tie?.total ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  if (!tie || !game) return null;
  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const total = Number(draft);
    setNotice("");
    if (
      !draft.trim() ||
      !Number.isInteger(total) ||
      total < 0 ||
      total > 2147483647
    ) {
      setError("Enter a nonnegative whole-number total score.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(base + "/tiebreaker", {
        method: "PUT",
        body: JSON.stringify({ total }),
      });
      setNotice("Tiebreaker saved.");
      onSaved();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel tiebreaker-panel">
      <p className="eyebrow">THE TIEBREAKER</p>
      <h3>
        {game.awayTeam} at {game.homeTeam}
      </h3>
      <p>
        Predict both teams' combined final score, including overtime. For
        example, 24–21 is a total of 45. Closest wins among players tied on
        correct picks; going over is allowed.
      </p>
      {tie.locked ? (
        <p className="notice">
          Locked ·{" "}
          {tie.total === null
            ? "No prediction saved"
            : `Your predicted total: ${tie.total}`}
          {tie.actualTotal !== null
            ? ` · Final total: ${tie.actualTotal}${tie.total !== null ? ` · Difference: ${Math.abs(tie.total - tie.actualTotal)}` : ""}`
            : " · Awaiting the final score"}
        </p>
      ) : (
        <form className="stack-form" onSubmit={save}>
          <label>
            Combined total score
            <input
              type="number"
              min="0"
              max="2147483647"
              step="1"
              required
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
              inputMode="numeric"
            />
          </label>
          <button disabled={busy}>
            {busy ? "Saving…" : "Save tiebreaker"}
          </button>
          <small>
            {tie.total === null
              ? "You haven't saved a tiebreaker yet."
              : `Saved total: ${tie.total}.`}{" "}
            You can change it until this game's kickoff.
          </small>
        </form>
      )}
      <p className="muted">
        Missing predictions lose the tiebreaker to saved predictions. Equal
        differences share the tied prizes evenly. Predictions stay private until
        kickoff.
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
    </section>
  );
}
