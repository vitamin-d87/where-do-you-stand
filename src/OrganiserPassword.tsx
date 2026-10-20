import { useState } from "react";
import { supabase } from "./api";

export function OrganiserPassword() {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <details className="panel">
      <summary>Set a survey password</summary>
      <p>
        Optionally set a separate password for this survey so future organiser
        sign-ins do not depend on email delivery. This does not change your
        Supabase dashboard password.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setSaved(false);
          if (password !== repeat) {
            setError("The passwords do not match.");
            return;
          }
          setBusy(true);
          try {
            const result = await supabase!.auth.updateUser({ password });
            if (result.error) throw result.error;
            setSaved(true);
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Could not save the password. Please retry.",
            );
          } finally {
            setPassword("");
            setRepeat("");
            setBusy(false);
          }
        }}
      >
        <label className="field-label">
          New survey password
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="field-label">
          Repeat survey password
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </label>
        <p className="small muted">
          Use at least 12 characters and a password unique to this survey.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p role="status">
            Survey password saved. You can now use it on the organiser sign-in
            screen.
          </p>
        )}
        <button className="secondary" disabled={busy}>
          {busy ? "Saving…" : "Save survey password"}
        </button>
      </form>
    </details>
  );
}
