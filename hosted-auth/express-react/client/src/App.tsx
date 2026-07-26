import { useEffect, useState } from "react";

type SessionState =
  | { authenticated: false }
  | {
      authenticated: true;
      user: {
        id: string;
        sessionId: string | null;
      };
    };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }
  return body as T;
}

export default function App() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [privateMessage, setPrivateMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("auth_error") ? "Sign-in could not be completed. Please try again." : null;
  });

  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, document.title, "/");
    }
    void api<SessionState>("/api/session")
      .then(setSession)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Session could not be loaded.");
        setSession({ authenticated: false });
      });
  }, []);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ authorizationUrl: string }>("/api/auth/login", {
        method: "POST",
        body: "{}",
      });
      window.location.assign(result.authorizationUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in could not be started.");
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ logoutUrl: string }>("/api/auth/logout", {
        method: "POST",
        body: "{}",
      });
      window.location.assign(result.logoutUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-out could not be completed.");
      setBusy(false);
    }
  };

  const loadPrivateData = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ message: string }>("/api/private");
      setPrivateMessage(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Protected data could not be loaded.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">NamoID Hosted Auth · Express + React</p>
        <h1>Your frontend never handles identity tokens.</h1>
        <p className="lede">
          React starts the journey. Express owns the confidential exchange,
          rotating refresh token, and application session.
        </p>
      </header>

      <section className="card" aria-live="polite">
        {session === null ? (
          <>
            <p className="status">Checking session</p>
            <h2>Loading your application…</h2>
          </>
        ) : session.authenticated ? (
          <>
            <p className="status success">Authenticated server session</p>
            <h2>Welcome back</h2>
            <p>
              React received only this safe application-session view. NamoID
              access and refresh tokens remain inside Express.
            </p>
            <dl>
              <div>
                <dt>User ID</dt>
                <dd>{session.user.id}</dd>
              </div>
              <div>
                <dt>NamoID session</dt>
                <dd>{session.user.sessionId ?? "Not provided"}</dd>
              </div>
            </dl>
            <div className="actions">
              <button className="button" type="button" disabled={busy} onClick={() => void loadPrivateData()}>
                Call protected API
              </button>
              <button className="button secondary" type="button" disabled={busy} onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
            {privateMessage && <p className="private-result">{privateMessage}</p>}
          </>
        ) : (
          <>
            <p className="status">Confidential web application</p>
            <h2>Sign in through NamoID</h2>
            <p>
              Express creates a state-bound PKCE transaction before redirecting
              you to the application&apos;s branded Hosted Auth page.
            </p>
            <button className="button" type="button" disabled={busy} onClick={() => void signIn()}>
              {busy ? "Starting sign-in…" : "Continue with NamoID"}
            </button>
          </>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      <footer>
        <span>HttpOnly cookie</span>
        <span>Server-side tokens</span>
        <span>Automatic rotation</span>
      </footer>
    </main>
  );
}
