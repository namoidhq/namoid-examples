import {
  createNamoIDClient,
  getNamoIDAuthConfig,
  revokeNativeSession,
  type NamoIDTokenResponse,
} from "@namoidhq/js";
import { validateAuthToken } from "@namoidhq/js/server";
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import helmet from "helmet";
import { fileURLToPath } from "node:url";

const clientId = required("NAMOID_CLIENT_ID");
const clientSecret = required("NAMOID_CLIENT_SECRET");
const sessionSecret = required("SESSION_SECRET");
const appBaseUrl = trimTrailingSlash(process.env.APP_BASE_URL ?? "http://localhost:5174");
const appOrigin = new URL(appBaseUrl).origin;
const port = Number(process.env.PORT ?? "4000");
const transactionLifetimeMs = 10 * 60 * 1000;
const refreshSkewMs = 60 * 1000;
const namoid = createNamoIDClient({ clientId });

if (sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters");
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: appBaseUrl.startsWith("https://") ? [] : null,
      },
    },
    strictTransportSecurity: appBaseUrl.startsWith("https://") ? undefined : false,
  }),
);
app.use(express.json({ limit: "16kb" }));
app.use(
  session({
    name: "namoid_example_session",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: appBaseUrl.startsWith("https://"),
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);
app.use("/api", (_request, response, next) => {
  response.setHeader("cache-control", "no-store");
  next();
});

const authRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.post(
  "/api/auth/login",
  authRateLimit,
  requireSameOrigin,
  asyncRoute(async (request, response) => {
    const transaction = await namoid.hostedAuth.createPublicTransaction();
    request.session.namoidTransaction = {
      state: transaction.state,
      codeVerifier: transaction.codeVerifier,
      createdAt: Date.now(),
    };
    const authorizationUrl = await namoid.hostedAuth.getUrl({
      mode: "sign_in",
      returnTo: `${appBaseUrl}/api/auth/callback`,
      state: transaction.state,
      completionMode: "confidential",
      codeChallenge: transaction.codeChallenge,
      codeChallengeMethod: transaction.codeChallengeMethod,
    });
    await saveSession(request);
    response.json({ authorizationUrl });
  }),
);

app.get("/api/auth/callback", authRateLimit, asyncRoute(async (request, response) => {
  const errorCode = stringQuery(request.query.error);
  const code = stringQuery(request.query.code);
  const returnedState = stringQuery(request.query.state);
  const transaction = request.session.namoidTransaction;
  delete request.session.namoidTransaction;

  if (
    errorCode ||
    !code ||
    !returnedState ||
    !transaction ||
    transaction.state !== returnedState ||
    Date.now() - transaction.createdAt > transactionLifetimeMs
  ) {
    await saveSession(request);
    response.redirect(303, "/?auth_error=callback");
    return;
  }

  try {
    const tokens = await namoid.hostedAuth.exchangeCode({
      code,
      codeVerifier: transaction.codeVerifier,
      clientSecret,
    });
    const validation = await validateAuthToken({
      token: tokens.access_token,
      clientId,
      clientSecret,
    });
    if (!validation.valid || !validation.user_id) {
      throw new Error(validation.error ?? "invalid_access_token");
    }

    await regenerateSession(request);
    request.session.namoidAuth = {
      tokens,
      userId: validation.user_id,
      sessionId: validation.session_id,
      expiresAt: tokenExpiry(tokens),
    };
    await saveSession(request);
    response.redirect(303, "/");
  } catch (error) {
    console.error("Hosted Auth callback failed", safeError(error));
    response.redirect(303, "/?auth_error=exchange");
  }
}));

app.get("/api/session", asyncRoute(async (request, response) => {
  const auth = await authenticatedSession(request);
  if (!auth) {
    response.json({ authenticated: false });
    return;
  }
  response.json({
    authenticated: true,
    user: {
      id: auth.userId,
      sessionId: auth.sessionId,
    },
  });
}));

app.get("/api/private", asyncRoute(async (request, response) => {
  const auth = await authenticatedSession(request);
  if (!auth) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }
  response.json({
    message: `Protected API access confirmed for user ${auth.userId}.`,
  });
}));

app.post("/api/auth/logout", requireSameOrigin, asyncRoute(async (request, response) => {
  const auth = request.session.namoidAuth;
  if (auth) {
    try {
      const current = await refreshIfNeeded(auth);
      await revokeNativeSession({
        accessToken: current.tokens.access_token,
        refreshToken: current.tokens.refresh_token,
      });
    } catch (error) {
      console.error("NamoID revocation failed", safeError(error));
    }
  }

  await destroySession(request);
  response.clearCookie("namoid_example_session", {
    httpOnly: true,
    sameSite: "lax",
    secure: appBaseUrl.startsWith("https://"),
  });
  let logoutUrl = appBaseUrl;
  try {
    const config = await getNamoIDAuthConfig({ clientId });
    const hostedLogout = new URL("/sign-out", ensureTrailingSlash(config.hosted_auth_base_url));
    hostedLogout.searchParams.set("return_to", appBaseUrl);
    const signInUrl = config.hosted_auth_pages.sign_in;
    if (signInUrl) {
      for (const [key, value] of new URL(signInUrl).searchParams) {
        hostedLogout.searchParams.set(key, value);
      }
    }
    logoutUrl = hostedLogout.toString();
  } catch (error) {
    console.error("Hosted session cleanup could not be started", safeError(error));
  }
  response.json({ logoutUrl });
}));

if (process.env.NODE_ENV === "production") {
  const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));
  app.use(express.static(clientDist, { index: false, maxAge: "1h" }));
  app.get("*", (_request, response) => {
    response.sendFile("index.html", { root: clientDist });
  });
}

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error("Request failed", safeError(error));
  response.status(500).json({ error: "The request could not be completed" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Express API listening on http://0.0.0.0:${port}`);
});

async function authenticatedSession(request: Request) {
  const auth = request.session.namoidAuth;
  if (!auth) return null;

  try {
    const current = await refreshIfNeeded(auth);
    request.session.namoidAuth = current;
    const validation = await validateAuthToken({
      token: current.tokens.access_token,
      clientId,
      clientSecret,
    });
    if (!validation.valid || validation.user_id !== current.userId) {
      delete request.session.namoidAuth;
      await saveSession(request);
      return null;
    }
    current.sessionId = validation.session_id;
    await saveSession(request);
    return current;
  } catch (error) {
    console.error("Session validation failed", safeError(error));
    delete request.session.namoidAuth;
    await saveSession(request);
    return null;
  }
}

async function refreshIfNeeded(auth: NonNullable<Request["session"]["namoidAuth"]>) {
  if (Date.now() < auth.expiresAt - refreshSkewMs) return auth;
  const refreshToken = auth.tokens.refresh_token;
  if (!refreshToken) throw new Error("refresh_token_missing");

  const response = await fetch("https://api.namoid.in/v1/auth/refresh", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) throw new Error(`refresh_failed_${response.status}`);
  const tokens = (await response.json()) as NamoIDTokenResponse;
  return {
    ...auth,
    tokens,
    expiresAt: tokenExpiry(tokens),
  };
}

function tokenExpiry(tokens: NamoIDTokenResponse): number {
  return Date.now() + Math.max(1, tokens.expires_in ?? 900) * 1000;
}

function requireSameOrigin(request: Request, response: Response, next: NextFunction) {
  if (request.get("origin") !== appOrigin) {
    response.status(403).json({ error: "Invalid request origin" });
    return;
  }
  next();
}

function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response, next).catch(next);
  };
}

function saveSession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function regenerateSession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function destroySession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function stringQuery(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
