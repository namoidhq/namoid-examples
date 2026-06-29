'use strict';

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { Issuer, generators } = require('openid-client');

const PORT = Number(process.env.PORT) || 3002;
const {
  NAMOID_ISSUER,
  NAMOID_CLIENT_ID,
  NAMOID_CLIENT_SECRET,
  NAMOID_REDIRECT_URI,
  SESSION_SECRET,
} = process.env;

for (const [name, value] of Object.entries({
  NAMOID_ISSUER,
  NAMOID_CLIENT_ID,
  NAMOID_CLIENT_SECRET,
  NAMOID_REDIRECT_URI,
  SESSION_SECRET,
})) {
  if (!value) {
    console.error(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const SCOPE = 'openid profile email';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch];
  });
}

function page(body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Express + NamoID quickstart</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; }
    a.button { display: inline-block; padding: 0.6rem 1.1rem; background: #111; color: #fff; border-radius: 0.4rem; text-decoration: none; }
    pre { background: #f4f4f5; padding: 1rem; border-radius: 0.4rem; overflow-x: auto; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

async function main() {
  const issuer = await Issuer.discover(NAMOID_ISSUER);

  const client = new issuer.Client({
    client_id: NAMOID_CLIENT_ID,
    client_secret: NAMOID_CLIENT_SECRET,
    redirect_uris: [NAMOID_REDIRECT_URI],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_basic',
  });

  const app = express();
  app.set('trust proxy', 1);

  app.use(
    session({
      name: 'namoid.sid',
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    }),
  );

  app.get('/', (req, res) => {
    const claims = req.session.claims;
    if (claims) {
      const name = escapeHtml(claims.name || claims.preferred_username || claims.sub);
      const email = escapeHtml(claims.email || 'no email claim');
      res.send(
        page(`
        <h1>Express + NamoID quickstart</h1>
        <p>Signed in as <strong>${name}</strong> (${email}).</p>
        <p><a class="button" href="/profile">View profile</a> &nbsp; <a href="/logout">Sign out</a></p>
      `),
      );
      return;
    }
    res.send(
      page(`
      <h1>Express + NamoID quickstart</h1>
      <p>You are not signed in.</p>
      <p><a class="button" href="/login">Sign in with NamoID</a></p>
    `),
    );
  });

  app.get('/login', (req, res) => {
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const state = generators.state();
    const nonce = generators.nonce();

    req.session.codeVerifier = codeVerifier;
    req.session.state = state;
    req.session.nonce = nonce;

    const authorizationUrl = client.authorizationUrl({
      scope: SCOPE,
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });

    res.redirect(authorizationUrl);
  });

  app.get('/callback', async (req, res) => {
    const { codeVerifier, state, nonce } = req.session;
    if (!codeVerifier || !state || !nonce) {
      res.status(400).send(page('<h1>Login session expired</h1><p><a href="/login">Try again</a></p>'));
      return;
    }

    try {
      const params = client.callbackParams(req);
      const tokenSet = await client.callback(NAMOID_REDIRECT_URI, params, {
        code_verifier: codeVerifier,
        state,
        nonce,
      });

      const claims = tokenSet.claims();

      delete req.session.codeVerifier;
      delete req.session.state;
      delete req.session.nonce;

      req.session.claims = claims;
      req.session.tokens = {
        access_token: tokenSet.access_token,
        id_token: tokenSet.id_token,
        refresh_token: tokenSet.refresh_token,
        expires_at: tokenSet.expires_at,
      };

      res.redirect('/profile');
    } catch (err) {
      console.error('OAuth callback failed:', err);
      res.status(400).send(
        page(`<h1>Sign-in failed</h1><pre>${escapeHtml(err.message || String(err))}</pre><p><a href="/login">Try again</a></p>`),
      );
    }
  });

  app.get('/profile', (req, res) => {
    const claims = req.session.claims;
    if (!claims) {
      res.redirect('/login');
      return;
    }
    res.send(
      page(`
      <h1>Your NamoID profile</h1>
      <p>These claims came from the validated <code>id_token</code>.</p>
      <pre>${escapeHtml(JSON.stringify(claims, null, 2))}</pre>
      <p><a href="/">Home</a> &nbsp; <a href="/logout">Sign out</a></p>
    `),
    );
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('namoid.sid');
      res.redirect('/');
    });
  });

  app.listen(PORT, () => {
    console.log(`Express + NamoID quickstart listening on http://localhost:${PORT}`);
    console.log(`Issuer: ${issuer.metadata.issuer}`);
  });
}

main().catch((err) => {
  console.error('Failed to start: could not discover the NamoID issuer.');
  console.error(err);
  process.exit(1);
});
