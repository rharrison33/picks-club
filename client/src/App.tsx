import { useEffect, useState } from "react";
import { api, ApiError, messageOf } from "./api";
import AuthScreen from "./AuthScreen";
import Dashboard from "./Dashboard";
import Profile from "./Profile";
import AccountHelp, { Verification, AgeConsent } from "./AccountHelp";
import type { Config, User } from "./types";
import "./App.css";

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(location.hash === "#profile");
  useEffect(() => { const change = () => setProfile(location.hash === "#profile"); window.addEventListener("hashchange", change); return () => window.removeEventListener("hashchange", change); }, []);
  const [emailLink] = useState(() => new URLSearchParams(location.hash.slice(1)));
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<Config>("/config", { signal: controller.signal }),
      api<{ user: User }>("/auth/me", { signal: controller.signal }).catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) return { user: null };
        throw e;
      }),
    ]).then(([settings, session]) => { setConfig(settings); setUser(session.user); setReady(true); })
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(messageOf(e)); });
    return () => controller.abort();
  }, []);
  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); setUser(null); setError(""); }
    catch (e) { setError(messageOf(e)); }
  }
  return <main className="app-shell">
    <header className="site-header"><a className="brand" href="/">PICKS<span> CLUB.</span></a>
      {user && <div className="account-nav">{user.photoUrl && <img className="member-avatar" src={user.photoUrl} alt=""/>}<span>{user.name}</span><a href="#profile">My profile</a><button onClick={logout}>Sign out</button></div>}
    </header>
    {error && <p role="alert" className="error-banner">{error} {!ready && <button onClick={() => location.reload()}>Retry</button>}</p>}
    {!ready && !error && <p role="status">Opening the club…</p>}
    {emailLink.has("reset") || emailLink.has("verify") ? <AccountHelp mode={emailLink.has("reset") ? "reset" : "verify"} token={emailLink.get("reset") ?? emailLink.get("verify") ?? ""}/> : ready && config && (user ? !user.ageConfirmed ? <AgeConsent onConfirmed={setUser}/> : config.requireVerified && !user.emailVerified ? <Verification/> : profile ? <Profile user={user} onSave={setUser}/> : <Dashboard key={user.id} user={user} config={config} onProfile={setUser}/> : <AuthScreen config={config} onLogin={setUser}/>)}
    <footer className="app-footer">Picks Club · Made for your Saturday circle.</footer>
  </main>;
}


