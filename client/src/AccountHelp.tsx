import { useState } from "react";
import { api, messageOf } from "./api";
import type { User } from "./types";
export default function AccountHelp({
  mode,
  token = "",
}: {
  mode: "verify" | "reset" | "forgot";
  token?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message: string }>(
        mode === "forgot" ? "/auth/forgot-password" : "/auth/complete-email",
        {
          method: "POST",
          body: JSON.stringify({ ...values, token, purpose: mode }),
        },
      );
      setNotice(result.message);
      if (mode !== "forgot") history.replaceState(null, "", location.pathname);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel auth-panel">
      <h2>
        {mode === "verify"
          ? "Verify your email"
          : mode === "reset"
            ? "Set a new password"
            : "Reset your password"}
      </h2>
      {!notice && (
        <form className="stack-form" onSubmit={submit}>
          <fieldset disabled={busy}>
            {mode === "forgot" && (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
            )}
            {mode === "reset" && (
              <label>
                New password
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                />
              </label>
            )}
            <button className="primary">
              {busy
                ? "Please wait…"
                : mode === "verify"
                  ? "Verify email"
                  : mode === "reset"
                    ? "Save password"
                    : "Send reset link"}
            </button>
          </fieldset>
        </form>
      )}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <a href="/">Back to Picks Club</a>
    </section>
  );
}
export function Verification() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h2>Check your email before joining a pool</h2>
      <p>Verify ownership of your email address to continue.</p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api<{ message: string }>(
              "/auth/request-verification",
              { method: "POST" },
            );
            setMessage(r.message);
          } catch (e) {
            setMessage(messageOf(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Send verification email
      </button>
      <button onClick={() => location.reload()}>I've verified my email</button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function AgeConsent({
  onConfirmed,
}: {
  onConfirmed: (user: User) => void;
}) {
  const [error, setError] = useState("");
  return (
    <section className="panel">
      <h2>Picks Club is for adults 21 and older</h2>
      <form
        className="stack-form"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            const result = await api<{ user: User }>("/auth/acknowledge-age", {
              method: "POST",
              body: JSON.stringify({ ageConfirmed: true }),
            });
            onConfirmed(result.user);
          } catch (e) {
            setError(messageOf(e));
          }
        }}
      >
        <label className="consent">
          <input type="checkbox" required />I confirm that I am at least 21
          years old.
        </label>
        <button>Continue</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
