#!/usr/bin/env node
/**
 * Check the four things an MCP client checks, before you plug in a real client.
 *
 * Run the server, then `pnpm verify`. Every line is one protocol requirement,
 * so a failure points at the exact step that is misconfigured.
 *
 *   MCP_BASE_URL   where this process listens (default http://localhost:3004)
 *   NAMOID_ISSUER / NAMOID_MCP_RESOURCE   read from .env if not already set
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

loadDotEnv(new URL("../.env", import.meta.url));

const baseUrl = trimSlash(process.env.MCP_BASE_URL ?? "http://localhost:3004");
const issuer = trimSlash(requireEnv("NAMOID_ISSUER"));
const resource = requireEnv("NAMOID_MCP_RESOURCE");
const metadataPath = protectedResourceMetadataPath(resource);

let failures = 0;

await check("server is running", async () => {
  const response = await fetch(`${baseUrl}/health`);
  if (!response.ok) throw new Error(`GET /health returned ${response.status}`);
  return baseUrl;
});

await check("NamoID discovery is reachable", async () => {
  const url = `${issuer}/.well-known/oauth-authorization-server`;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`);
  const document = await response.json();
  if (document.issuer !== issuer) {
    throw new Error(`issuer mismatch: expected ${issuer}, document says ${document.issuer}`);
  }
  const cimd = document.client_id_metadata_document_supported === true;
  return `${document.issuer} (PKCE ${(document.code_challenge_methods_supported ?? []).join(",")}, CIMD ${cimd ? "yes" : "no"})`;
});

await check("protected-resource metadata is published", async () => {
  const response = await fetch(`${baseUrl}${metadataPath}`);
  if (!response.ok) throw new Error(`GET ${metadataPath} returned ${response.status}`);
  const document = await response.json();
  if (document.resource !== resource) {
    throw new Error(`metadata resource is ${document.resource}, expected ${resource}`);
  }
  if (!(document.authorization_servers ?? []).includes(issuer)) {
    throw new Error(`metadata does not list ${issuer} as an authorization server`);
  }
  return `${document.resource} -> ${document.authorization_servers.join(", ")} [${(document.scopes_supported ?? []).join(" ")}]`;
});

await check("unauthenticated call returns a discovery challenge", async () => {
  const response = await postMcp();
  if (response.status !== 401) throw new Error(`expected 401, received ${response.status}`);
  const challenge = response.headers.get("www-authenticate") ?? "";
  if (!challenge.toLowerCase().startsWith("bearer")) {
    throw new Error("WWW-Authenticate is missing or is not a Bearer challenge");
  }
  if (!challenge.includes("resource_metadata=")) {
    throw new Error("WWW-Authenticate does not point at resource_metadata");
  }
  return challenge;
});

await check("a forged token is rejected", async () => {
  const response = await postMcp("not-a-real-token");
  if (response.status !== 401) throw new Error(`expected 401, received ${response.status}`);
  const body = await response.json().catch(() => ({}));
  if (body.error !== "invalid_token") {
    throw new Error(`expected error "invalid_token", received ${JSON.stringify(body.error)}`);
  }
  return "invalid_token";
});

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All checks passed. The resource-server half of the flow is correct.");
console.log(`Connect a client at ${resource} using a preregistered Client ID or a`);
console.log("Client ID Metadata Document — see \"Connect an MCP client\" in the README.");

function postMcp(token) {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

async function check(label, run) {
  try {
    const detail = await run();
    console.log(`  ok    ${label}\n        ${detail}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  ${label}\n        ${error instanceof Error ? error.message : error}`);
  }
}

/** RFC 9728 inserts the well-known segment between authority and resource path. */
function protectedResourceMetadataPath(resourceUrl) {
  const { pathname } = new URL(resourceUrl);
  return `/.well-known/oauth-protected-resource${pathname === "/" ? "" : pathname}`;
}

function loadDotEnv(url) {
  let contents;
  try {
    contents = readFileSync(fileURLToPath(url), "utf8");
  } catch {
    return;
  }
  for (const line of contents.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is required. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

function trimSlash(value) {
  return value.replace(/\/+$/, "");
}
