import {
  completeHostedAuthRedirect,
  HostedAuthButton,
  type CompletedHostedAuth,
  useAuthConfig,
  useNamoID,
} from "@namoidhq/react";
import { useEffect, useRef, useState } from "react";

export default function App() {
  const client = useNamoID();
  const { config, loading: configLoading, error: configError } = useAuthConfig();
  const [auth, setAuth] = useState<CompletedHostedAuth | null>(null);
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
        setAuth(result);
        window.history.replaceState({}, document.title, "/");
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Sign-in could not be completed.");
      })
      .finally(() => setCallbackPending(false));
  }, [callbackPending, client]);

  const signOut = async () => {
    if (!auth) return;
    setError(null);
    try {
      const token = auth.tokens.refresh_token ?? auth.tokens.access_token;
      await client.hostedAuth.revoke({
        token,
        tokenTypeHint: auth.tokens.refresh_token ? "refresh_token" : "access_token",
      });
      const idTokenHint = auth.tokens.id_token;
      setAuth(null);
      if (idTokenHint) {
        window.location.assign(
          await client.hostedAuth.getLogoutUrl({
            idTokenHint,
            postLogoutRedirectUri: window.location.origin,
          }),
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Session revocation failed.");
    }
  };

  const redirectUri = `${window.location.origin}/auth/callback`;

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
        ) : auth ? (
          <>
            <p className="status success">Authenticated</p>
            <h2>You are signed in</h2>
            <p>
              Tokens remain only in memory. Reloading or closing this tab removes
              the local example session.
            </p>
            <dl>
              <div>
                <dt>Token type</dt>
                <dd>{auth.tokens.token_type}</dd>
              </div>
              <div>
                <dt>Expires in</dt>
                <dd>
                  {auth.tokens.expires_in
                    ? `${auth.tokens.expires_in} seconds`
                    : "Not provided"}
                </dd>
              </div>
              <div>
                <dt>Subject</dt>
                <dd>{auth.identity.sub}</dd>
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
            <HostedAuthButton className="button" redirectUri={redirectUri}>
              Sign in
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
        <span>Secured by NamoID</span>
        <span>Public Client</span>
        <span>Authorization Code + PKCE</span>
        <span>No Client Secret</span>
      </footer>
    </main>
  );
}
