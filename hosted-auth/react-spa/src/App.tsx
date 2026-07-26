import { revokeNativeSession, type NamoIDTokenResponse } from "@namoidhq/js";
import {
  completeHostedAuthRedirect,
  HostedAuthButton,
  useAuthConfig,
  useNamoID,
} from "@namoidhq/react";
import { useEffect, useRef, useState } from "react";

const TOKEN_STORAGE_KEY = "namoid_example_session";

function readStoredSession(): NamoIDTokenResponse | null {
  const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NamoIDTokenResponse;
  } catch {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    return null;
  }
}

export default function App() {
  const client = useNamoID();
  const { config, loading: configLoading, error: configError } = useAuthConfig();
  const [tokens, setTokens] = useState<NamoIDTokenResponse | null>(readStoredSession);
  const [callbackPending, setCallbackPending] = useState(
    () => new URL(window.location.href).searchParams.has("code"),
  );
  const [error, setError] = useState<string | null>(null);
  const completionStarted = useRef(false);

  useEffect(() => {
    if (!callbackPending || completionStarted.current) return;
    completionStarted.current = true;

    void completeHostedAuthRedirect(client)
      .then((result) => {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(result));
        setTokens(result);
        window.history.replaceState({}, document.title, "/");
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Sign-in could not be completed.");
      })
      .finally(() => setCallbackPending(false));
  }, [callbackPending, client]);

  const signOut = async () => {
    if (!tokens) return;
    setError(null);
    try {
      await revokeNativeSession({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Session revocation failed.");
      return;
    }
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setTokens(null);
  };

  const returnTo = `${window.location.origin}/auth/callback`;

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">NamoID Hosted Auth · React SPA</p>
        <h1>Public-client authentication without a browser secret.</h1>
        <p className="lede">
          This example resolves Hosted Auth from one Client ID and protects the
          authorization-code exchange with PKCE.
        </p>
      </section>

      <section className="card" aria-live="polite">
        {callbackPending ? (
          <>
            <p className="status">Completing sign-in…</p>
            <h2>Verifying the callback</h2>
            <p>The one-time code and stored PKCE transaction are being checked.</p>
          </>
        ) : tokens ? (
          <>
            <p className="status success">Authenticated</p>
            <h2>You are signed in</h2>
            <p>
              The access token is held in this tab&apos;s session storage. Closing
              the tab removes the local example session.
            </p>
            <dl>
              <div>
                <dt>Token type</dt>
                <dd>{tokens.token_type}</dd>
              </div>
              <div>
                <dt>Expires in</dt>
                <dd>{tokens.expires_in ? `${tokens.expires_in} seconds` : "Not provided"}</dd>
              </div>
            </dl>
            <button className="button secondary" type="button" onClick={() => void signOut()}>
              Sign out and revoke session
            </button>
          </>
        ) : (
          <>
            <p className="status">
              {configLoading
                ? "Loading application configuration…"
                : config
                  ? `${config.signin_methods.length} sign-in methods enabled`
                  : "Configuration unavailable"}
            </p>
            <h2>Try the complete browser flow</h2>
            <p>
              NamoID handles the branded sign-in page and returns here with a
              one-time authorization code.
            </p>
            <HostedAuthButton className="button" returnTo={returnTo}>
              Sign in with NamoID
            </HostedAuthButton>
          </>
        )}

        {(error || configError) && (
          <p className="error" role="alert">
            {error ?? configError?.message}
          </p>
        )}
      </section>

      <footer>
        <span>Public Client</span>
        <span>Authorization Code + PKCE</span>
        <span>No Client Secret</span>
      </footer>
    </main>
  );
}
