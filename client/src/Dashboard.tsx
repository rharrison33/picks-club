import { useEffect, useState } from "react";
import { api, dollars, messageOf, parseFee } from "./api";
import PoolView from "./PoolView";
import EntryAmount from "./EntryAmount";

import SmsSettings from "./SmsSettings";
import type { Config, Pool, User } from "./types";

export default function Dashboard({
  config,
  onProfile,
}: {
  user: User;
  config: Config;
  onProfile: (user: User) => void;
}) {
  const [pools, setPools] = useState<Pool[]>([]);
  const [active, setActive] = useState(
    () => new URLSearchParams(location.search).get("pool") ?? "",
  );
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<{ pools: Pool[] }>("/pools", { signal: controller.signal })
      .then((r) => setPools(r.pools))
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(messageOf(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  function update(pool: Pool) {
    setPools((current) => [...current.filter((p) => p.id !== pool.id), pool]);
    setActive(pool.id);
  }
  async function submit(
    event: React.SubmitEvent<HTMLFormElement>,
    kind: "create" | "join" | "profile",
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (kind === "profile") {
        const r = await api<{ user: User }>("/auth/profile", {
          method: "PATCH",
          body: JSON.stringify({
            ...values,
            favoriteTeams: new FormData(form).getAll("favoriteTeams"),
          }),
        });
        onProfile(r.user);
        setRevision((v) => v + 1);
        setNotice(
          "Profile saved. New game suggestions will use your favorite teams.",
        );
      } else {
        const body =
          kind === "create"
            ? {
                name: values.name,
                timezone: values.timezone,
                defaultFeeCents: parseFee(String(values.amount)),
              }
            : values;
        const r = await api<{ pool: Pool }>(
          kind === "create" ? "/pools" : "/pools/join",
          { method: "POST", body: JSON.stringify(body) },
        );
        update(r.pool);
        form.reset();
        setNotice(
          kind === "create"
            ? "Your pool is ready. Share its invitation code with your friends."
            : "You're in!",
        );
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  const selected = active ? pools.find((p) => p.id === active) : pools[0];
  const saturday =
    selected &&
    new Intl.DateTimeFormat("en-US", {
      timeZone: selected.timezone,
      weekday: "short",
    }).format(new Date()) === "Sat";
  return (
    <>
      {!saturday && (
        <section className="dashboard-intro">
          <p className="eyebrow">YOUR SATURDAY STARTS HERE</p>
          <h1>
            My club<span>.</span>
          </h1>
          <p className="muted">
            Different circles. Different rivalries. One place to bring everyone
            together.
          </p>
        </section>
      )}
      {saturday && (
        <label className="saturday-pool-switch">
          Your pool
          <select
            value={selected.id}
            onChange={(event) => setActive(event.target.value)}
          >
            {pools.map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.name}
              </option>
            ))}
          </select>
        </label>
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
      <div className={`dashboard-grid ${saturday ? "dashboard-saturday" : ""}`}>
        <aside className="club-sidebar">
          <section className="panel">
            <h2>
              My pools <small>{pools.length}</small>
            </h2>
            {loading && <p role="status">Loading pools…</p>}
            {!loading && !pools.length && (
              <p className="muted">
                Create your first pool or join a friend's.
              </p>
            )}
            <nav className="pool-nav" aria-label="Your pools">
              {pools.map((pool) => (
                <button
                  key={pool.id}
                  aria-current={selected?.id === pool.id ? "page" : undefined}
                  onClick={() => setActive(pool.id)}
                >
                  <strong>{pool.name}</strong>
                  <span>
                    {pool.role} · {pool.members.length} members ·{" "}
                    {dollars(pool.defaultFeeCents)}/week
                  </span>
                </button>
              ))}
            </nav>
          </section>
          <details className="panel">
            <summary>Create a pool</summary>
            <form className="stack-form" onSubmit={(e) => submit(e, "create")}>
              <fieldset disabled={busy}>
                <label>
                  Pool name
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="Saturday crew"
                  />
                </label>
                <label>
                  Pool timezone
                  <select name="timezone" defaultValue="America/Denver">
                    {config.timezones.map((tz) => (
                      <option key={tz}>{tz}</option>
                    ))}
                  </select>
                </label>
                <EntryAmount />
                <small>
                  Per player. You can set a different amount for each week
                  before publishing.
                </small>
                <button className="primary">Create pool</button>
              </fieldset>
            </form>
          </details>
          <details className="panel">
            <summary>Join a pool</summary>
            <form className="stack-form" onSubmit={(e) => submit(e, "join")}>
              <fieldset disabled={busy}>
                <label>
                  Invitation code
                  <input
                    name="code"
                    required
                    autoCapitalize="characters"
                    spellCheck={false}
                  />
                </label>
                <button className="primary">Join pool</button>
              </fieldset>
            </form>
          </details>
          <section className="panel">
            <a href="#profile">Edit my profile, photo & favorite teams</a>
          </section>
          <SmsSettings />
        </aside>
        <section className="pool-content">
          {selected ? (
            <PoolView
              key={selected.id + selected.role}
              pool={selected}
              onUpdate={update}
            />
          ) : (
            <div className="panel empty-club">
              <p className="eyebrow">BUILD YOUR CIRCLE</p>
              <h2>
                Every great Saturday
                <br />
                starts with your people.
              </h2>
              <p>
                Create a private pool to choose the games, or enter an
                invitation code to join your friends.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
