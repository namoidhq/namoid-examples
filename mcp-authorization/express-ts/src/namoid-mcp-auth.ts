/**
 * NamoID authorization for a customer-owned MCP server.
 *
 * NamoID is the authorization server. This process is the protected resource.
 * An MCP host (Claude, ChatGPT, Cursor, VS Code, MCP Inspector) is the OAuth
 * client. The signed-in human is the resource owner.
 *
 * This module is deliberately dependency-light and framework-agnostic apart
 * from the MCP SDK's Express middleware, so it can be copied into a real MCP
 * server as-is. Nothing here talks to a NamoID management API — a protected
 * resource only needs public discovery metadata and JWKS.
 */

import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  OAuthMetadataSchema,
  type OAuthMetadata,
  type OAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/** NamoID signs every environment's tokens with RS256. Nothing else is accepted. */
const ALLOWED_ALGORITHMS = ["RS256"] as const;

/** Discovery must not hang server startup behind an unreachable issuer. */
const DISCOVERY_TIMEOUT_MS = 5_000;

export interface NamoIDMcpAuthOptions {
  /**
   * The NamoID environment issuer, for example
   * `https://acme-test.id.namoid.in`. Copy it from **Integration details ->
   * Authorization server** in the Console. Test and Live are separate issuers.
   */
  issuer: string;
  /**
   * The canonical public URL of this MCP server, exactly as registered as the
   * resource audience in NamoID, for example `https://mcp.acme.example/mcp`.
   * Tokens carry this string in `aud`, so a mismatch here rejects every token.
   */
  resource: string;
  /** Human-readable name shown to users during discovery and consent. */
  resourceName?: string;
  /**
   * Scopes advertised for an ordinary first connection. Keep this minimal —
   * sensitive write scopes should be requested incrementally instead of being
   * bundled into the initial consent screen.
   */
  scopesSupported: string[];
  /** Allowed clock skew in seconds when checking `exp`/`nbf`. Defaults to 30. */
  clockToleranceSeconds?: number;
}

export interface NamoIDMcpAuth {
  /** NamoID's authorization-server metadata, fetched once at startup. */
  authorizationServer: OAuthMetadata;
  /** The RFC 9728 document this server must serve. */
  protectedResourceMetadata: OAuthProtectedResourceMetadata;
  /** Path to mount the document on, e.g. `/.well-known/oauth-protected-resource/mcp`. */
  protectedResourceMetadataPath: string;
  /** Absolute URL of the same document, used in `WWW-Authenticate` challenges. */
  protectedResourceMetadataUrl: string;
  /** Token verifier for the SDK's `requireBearerAuth` middleware. */
  verifier: OAuthTokenVerifier;
}

/** Immutable identity of the caller behind a single tool invocation. */
export interface McpCaller {
  /** NamoID user ID (`sub`). The human who consented, never the MCP host. */
  subject: string;
  /** The OAuth client — a preregistered client ID or a CIMD document URL. */
  clientId: string;
  /** Scopes actually granted, not the scopes the client asked for. */
  scopes: ReadonlySet<string>;
  tenantId?: string;
  projectId?: string;
  environmentId?: string;
}

/**
 * Verify NamoID discovery, build a token verifier, and derive the RFC 9728
 * metadata this server has to publish.
 *
 * Runs at startup so a wrong issuer or resource URL fails immediately with a
 * readable message rather than as an opaque 401 on the first tool call.
 */
export async function createNamoIDMcpAuth(options: NamoIDMcpAuthOptions): Promise<NamoIDMcpAuth> {
  const issuer = assertIssuer(options.issuer);
  const resource = assertResource(options.resource);
  const clockTolerance = options.clockToleranceSeconds ?? 30;

  const { metadata, jwksUri } = await discoverAuthorizationServer(issuer);
  const jwks = createRemoteJWKSet(new URL(jwksUri));

  const protectedResourceMetadata: OAuthProtectedResourceMetadata = {
    resource: resource.href,
    resource_name: options.resourceName,
    authorization_servers: [metadata.issuer],
    scopes_supported: [...options.scopesSupported],
    bearer_methods_supported: ["header"],
  };

  const metadataUrl = getOAuthProtectedResourceMetadataUrl(resource);

  const verifier: OAuthTokenVerifier = {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(token, jwks, {
          issuer,
          audience: resource.href,
          algorithms: [...ALLOWED_ALGORITHMS],
          clockTolerance,
        }));
      } catch (error) {
        // Never echo the token or a stack trace back to the client.
        throw new InvalidTokenError(describeVerificationFailure(error));
      }

      // An ID token is not an API token. NamoID stamps `token_use` so a
      // resource server can tell them apart even though both are RS256 JWTs
      // from the same issuer with the same `iss`.
      if (payload.token_use !== "access") {
        throw new InvalidTokenError("token is not an access token");
      }

      const subject = requiredStringClaim(payload, "sub");
      const clientId = requiredStringClaim(payload, "client_id");
      if (typeof payload.exp !== "number") {
        throw new InvalidTokenError("token has no expiration time");
      }

      return {
        token,
        clientId,
        scopes: parseScopes(payload.scope),
        expiresAt: payload.exp,
        resource,
        extra: {
          subject,
          tenantId: optionalStringClaim(payload, "tid"),
          projectId: optionalStringClaim(payload, "pid"),
          environmentId: optionalStringClaim(payload, "eid"),
          tokenId: optionalStringClaim(payload, "jti"),
        },
      };
    },
  };

  return {
    authorizationServer: metadata,
    protectedResourceMetadata,
    protectedResourceMetadataPath: new URL(metadataUrl).pathname,
    protectedResourceMetadataUrl: metadataUrl,
    verifier,
  };
}

/**
 * Wrap a tool handler so it runs only when the caller's token carries every
 * required scope.
 *
 * A scope is permission to *attempt* an action. Business rules — ownership,
 * organization boundaries, transaction limits — still belong inside `handler`.
 */
export function requireScopes<Args>(
  auth: NamoIDMcpAuth,
  requiredScopes: readonly string[],
  handler: (args: Args, caller: McpCaller) => Promise<CallToolResult>,
): (args: Args, extra: { authInfo?: AuthInfo }) => Promise<CallToolResult> {
  return async (args, extra) => {
    const caller = callerFrom(extra.authInfo);
    if (caller === null) {
      // Unreachable when the transport sits behind requireBearerAuth; kept so
      // a future unauthenticated mount fails closed instead of open.
      return insufficientScopeResult(auth, requiredScopes, []);
    }

    const missing = requiredScopes.filter((scope) => !caller.scopes.has(scope));
    if (missing.length > 0) {
      return insufficientScopeResult(auth, missing, [...caller.scopes]);
    }

    return handler(args, caller);
  };
}

function callerFrom(authInfo: AuthInfo | undefined): McpCaller | null {
  if (!authInfo) return null;
  const extra = authInfo.extra ?? {};
  return {
    subject: typeof extra.subject === "string" ? extra.subject : "",
    clientId: authInfo.clientId,
    scopes: new Set(authInfo.scopes),
    tenantId: typeof extra.tenantId === "string" ? extra.tenantId : undefined,
    projectId: typeof extra.projectId === "string" ? extra.projectId : undefined,
    environmentId: typeof extra.environmentId === "string" ? extra.environmentId : undefined,
  };
}

/**
 * Tell the host which scopes are missing so it can start incremental
 * authorization instead of giving up.
 *
 * The HTTP-level `403` + `WWW-Authenticate` challenge only applies to the
 * whole endpoint. A single tool that needs an elevated scope has to answer
 * inside the JSON-RPC response, so the same `insufficient_scope` error code
 * and `resource_metadata` pointer are carried in structured content.
 */
function insufficientScopeResult(
  auth: NamoIDMcpAuth,
  missingScopes: readonly string[],
  grantedScopes: readonly string[],
): CallToolResult {
  const scopeList = missingScopes.join(" ");
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          `This action needs additional authorization. Missing scope(s): ${scopeList}. ` +
          "Reconnect and approve the additional access to continue.",
      },
    ],
    structuredContent: {
      error: "insufficient_scope",
      required_scopes: [...missingScopes],
      granted_scopes: [...grantedScopes],
      resource: auth.protectedResourceMetadata.resource,
      resource_metadata: auth.protectedResourceMetadataUrl,
      www_authenticate:
        `Bearer error="insufficient_scope", scope="${scopeList}", ` +
        `resource_metadata="${auth.protectedResourceMetadataUrl}"`,
    },
  };
}

async function discoverAuthorizationServer(
  issuer: string,
): Promise<{ metadata: OAuthMetadata; jwksUri: string }> {
  const discoveryUrl = new URL("/.well-known/oauth-authorization-server", `${issuer}/`);
  const document = await fetchJson(discoveryUrl);

  const parsed = OAuthMetadataSchema.safeParse(document);
  if (!parsed.success) {
    throw new Error(`${discoveryUrl.href} is not valid OAuth authorization-server metadata`);
  }

  // RFC 9700 mix-up defence: the document must claim the issuer we asked for.
  if (parsed.data.issuer !== issuer) {
    throw new Error(
      `issuer mismatch: NAMOID_ISSUER is ${issuer} but ${discoveryUrl.href} declares ${parsed.data.issuer}`,
    );
  }

  // `jwks_uri` is required by RFC 8414 but sits outside the SDK's typed
  // subset, so it is validated here rather than trusted from an index access.
  const jwksUri = (document as Record<string, unknown>).jwks_uri;
  if (typeof jwksUri !== "string" || !jwksUri) {
    throw new Error(`${discoveryUrl.href} does not advertise a jwks_uri`);
  }

  return { metadata: parsed.data, jwksUri };
}

async function fetchJson(url: URL): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `could not reach ${url.href}: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  if (!response.ok) {
    throw new Error(`${url.href} returned HTTP ${response.status}`);
  }
  return response.json();
}

function assertIssuer(value: string): string {
  const issuer = value.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new Error(`NAMOID_ISSUER must be an absolute URL, received "${value}"`);
  }
  if (url.search || url.hash) {
    throw new Error("NAMOID_ISSUER must not contain a query string or fragment");
  }
  if (url.protocol !== "https:" && !isLocalHostname(url.hostname)) {
    throw new Error("NAMOID_ISSUER must use https outside local development");
  }
  return issuer;
}

function assertResource(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`NAMOID_MCP_RESOURCE must be an absolute URL, received "${value}"`);
  }
  if (url.hash) {
    // RFC 8707 resource indicators carry no fragment, and `aud` is compared
    // as an exact string.
    throw new Error("NAMOID_MCP_RESOURCE must not contain a fragment");
  }
  if (url.protocol !== "https:" && !isLocalHostname(url.hostname)) {
    throw new Error("NAMOID_MCP_RESOURCE must use https outside local development");
  }
  return url;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

function parseScopes(scope: unknown): string[] {
  if (typeof scope !== "string") return [];
  return scope.split(/\s+/).filter(Boolean);
}

function requiredStringClaim(payload: JWTPayload, claim: string): string {
  const value = payload[claim];
  if (typeof value !== "string" || !value) {
    throw new InvalidTokenError(`token is missing the ${claim} claim`);
  }
  return value;
}

function optionalStringClaim(payload: JWTPayload, claim: string): string | undefined {
  const value = payload[claim];
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Map a verification failure to a short, non-revealing reason. `jose` sets a
 * stable `code` on its errors; anything else collapses to a generic message.
 */
function describeVerificationFailure(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  switch (code) {
    case "ERR_JWT_EXPIRED":
      return "token has expired";
    case "ERR_JWT_CLAIM_VALIDATION_FAILED":
      return "token issuer or audience does not match this MCP server";
    case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED":
      return "token signature could not be verified";
    case "ERR_JWKS_NO_MATCHING_KEY":
      return "token was signed with an unknown key";
    case "ERR_JOSE_ALG_NOT_ALLOWED":
      return "token uses an unsupported signing algorithm";
    default:
      return "token could not be verified";
  }
}
