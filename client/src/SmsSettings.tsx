import { useEffect, useState } from "react";
import { api, messageOf } from "./api";
type Settings = {
  optedIn: boolean;
  phone: string;
  verified: boolean;
  deliveryAvailable: boolean;
  consent: string;
};
export default function SmsSettings() {
  const [settings, setSettings] = useState<Settings | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<Settings>("/auth/sms", { signal: controller.signal })
      .then(setSettings)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setNotice(messageOf(e));
      });
    return () => controller.abort();
  }, [revision]);
  async function act(path: string, method: string, body: unknown) {
    setBusy(true);
    try {
      const r = await api<{ message: string }>("/auth/sms" + path, {
        method,
        body: JSON.stringify(body),
      });
      setNotice(r.message);
      setRevision((v) => v + 1);
    } catch (e) {
      setNotice(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel">
      <summary>Saturday SMS updates</summary>
      {settings && (
        <>
          <p className="muted">
            {settings.optedIn
              ? settings.verified && settings.deliveryAvailable
                ? "Updates are on."
                : "Opt-in saved; delivery is pending activation and phone verification."
              : "SMS is optional and off by default."}
          </p>
          {!settings.deliveryAvailable && (
            <p className="muted">
              Text delivery is not active yet. You can save your preference now.
            </p>
          )}
          <form
            className="stack-form"
            key={settings.phone + revision}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void act("", "PUT", {
                optedIn: true,
                phone: form.get("phone"),
                consent: form.get("consent") === "on",
              });
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Mobile number
                <input
                  type="tel"
                  name="phone"
                  defaultValue={settings.phone}
                  placeholder="+1 303 555 0123"
                  autoComplete="tel"
                  required
                />
              </label>
              <label className="consent">
                <input type="checkbox" name="consent" required />
                {settings.consent}
              </label>
              <button>Save SMS opt-in</button>
            </fieldset>
          </form>
          {settings.optedIn && (
            <button
              disabled={busy}
              onClick={() => act("", "PUT", { optedIn: false })}
            >
              Turn off SMS
            </button>
          )}
          {settings.deliveryAvailable &&
            settings.optedIn &&
            !settings.verified && (
              <>
                <button
                  disabled={busy}
                  onClick={() => act("/verify", "POST", {})}
                >
                  Send verification code
                </button>
                <form
                  className="stack-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void act("/confirm", "POST", {
                      code: new FormData(event.currentTarget).get("code"),
                    });
                  }}
                >
                  <label>
                    Verification code
                    <input
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                    />
                  </label>
                  <button disabled={busy}>Verify phone</button>
                </form>
              </>
            )}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
