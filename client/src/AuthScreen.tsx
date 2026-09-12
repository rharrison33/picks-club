import { useRef, useState } from "react";
import { api, messageOf } from "./api";
import type { Config, User } from "./types";
import AccountHelp from "./AccountHelp";
import FavoriteTeams from "./FavoriteTeams";

export default function AuthScreen({ config, onLogin }: { config: Config; onLogin: (user: User) => void }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [forgot, setForgot] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [fields, setFields] = useState({ name: "", email: "", password: "", registrationCode: "", ageConfirmed: false });
  const [favoriteCount, setFavoriteCount] = useState(0);
  const summary = useRef<HTMLDivElement>(null);
  const issues: Record<string, string> = {};
  if (register && (fields.name.trim().length < 3 || fields.name.trim().length > 60)) issues.name = "Enter a display name with 3–60 characters.";
  if (fields.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) issues.email = "Enter a valid email, like you@example.com.";
  if (fields.password.length < (register ? 8 : 1) || fields.password.length > 128) issues.password = register ? "Use a password with 8–128 characters." : "Enter your password.";
  if (register && favoriteCount === 0) issues.favorites = "Select at least one favorite team from the search results.";
  if (register && !fields.ageConfirmed) issues.ageConfirmed = "Check the box to confirm you are at least 21.";
  if (register && config.registrationRestricted && !fields.registrationCode.trim()) issues.registrationCode = "Enter your pilot access code.";
  function changeMode(next: boolean) {
    if (next === register) return;
    setRegister(next); setError(""); setAttempted(false); setFavoriteCount(0);
    setFields({ name: "", email: "", password: "", registrationCode: "", ageConfirmed: false });
  }
  const fieldError = (key: string) => attempted && issues[key] ? <small id={`error-${key}`} className="field-error">{issues[key]}</small> : null;
  const accessibility = (key: string) => ({ "aria-invalid": attempted && !!issues[key], "aria-describedby": attempted && issues[key] ? `error-${key}` : undefined });
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setAttempted(true);
    if (Object.keys(issues).length) {
      setError("");
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    setBusy(true); setError("");
    try {
      const result = await api<{ user: User }>("/auth/" + (register ? "register" : "login"), {
        method: "POST", body: JSON.stringify({ ...Object.fromEntries(form), favoriteTeams: form.getAll("favoriteTeams"), ageConfirmed: form.get("ageConfirmed") === "on" }),
      });
      onLogin(result.user);
    } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  if (forgot) return <AccountHelp mode="forgot"/>;
  return <div className="auth-layout">
    <section className="hero"><p className="eyebrow">YOUR PEOPLE. YOUR SATURDAY.</p><h1>Pick a side.<br/><span>Bring your circle.</span></h1><p className="hero-copy">Create a private pool, invite your friends, and build a Saturday worth talking about.</p><div className="auth-benefits"><span>01 · Private pools</span><span>02 · Eight great games</span><span>03 · Coast-to-coast rivalries</span></div></section>
    <section className="panel auth-panel"><p className="eyebrow">WELCOME TO PICKS CLUB</p><h2>{register ? "Join the club" : "Good to have you back"}</h2>
      <div className="view-tabs"><button type="button" aria-pressed={!register} disabled={busy} onClick={() => changeMode(false)}>Sign in</button><button type="button" aria-pressed={register} disabled={busy} onClick={() => changeMode(true)}>Register</button></div>
      <form noValidate onSubmit={submit} key={String(register)} className="stack-form">
        <fieldset disabled={busy}>
          {register && <label>Display name<input name="name" autoComplete="nickname" required minLength={3} maxLength={60} value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} {...accessibility("name")}/>{fieldError("name")}</label>}
          <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} value={fields.email} onChange={(e) => setFields({ ...fields, email: e.target.value })} {...accessibility("email")}/>{fieldError("email")}</label>
          <label>Password<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 8 : 1} maxLength={128} value={fields.password} onChange={(e) => setFields({ ...fields, password: e.target.value })} {...accessibility("password")}/>{fieldError("password")}</label>
          {register && <><small>Use at least 8 characters.</small><FavoriteTeams onSelectionChange={(teams) => setFavoriteCount(teams.length)} invalid={attempted && !!issues.favorites}/>{fieldError("favorites")}</>}
          {register && <><label className="consent"><input name="ageConfirmed" type="checkbox" required checked={fields.ageConfirmed} onChange={(e) => setFields({ ...fields, ageConfirmed: e.target.checked })} {...accessibility("ageConfirmed")}/>I confirm that I am at least 21 years old.</label>{fieldError("ageConfirmed")}</>}
          {register && config.registrationRestricted && <label>Pilot access code<input name="registrationCode" required autoComplete="off" value={fields.registrationCode} onChange={(e) => setFields({ ...fields, registrationCode: e.target.value })} {...accessibility("registrationCode")}/>{fieldError("registrationCode")}</label>}
          {attempted && Object.keys(issues).length > 0 && <div ref={summary} tabIndex={-1} className="registration-checklist" role="alert"><strong>{register ? "Almost there — finish these steps" : "Check your sign-in details"}</strong><ul>{Object.entries(issues).map(([key, message]) => <li key={key}>{message}</li>)}</ul></div>}
          {error && <p role="alert" className="error-banner">{error}</p>}
          <button className="primary" type="submit">{busy ? "Please wait…" : register ? "Create account" : "Sign in"}</button>
        </fieldset>
      </form>
      {config.emailEnabled && <button type="button" onClick={() => setForgot(true)}>Forgot password?</button>}
      <p className="muted">No entry payments are collected in this version.</p>
    </section>
  </div>;
}

