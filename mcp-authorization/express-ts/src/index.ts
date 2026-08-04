/**
 * Acme Finance MCP server, protected by NamoID.
 *
 * Four tools, four scopes, one canonical resource URL. The interesting part is
 * the wiring below the tool definitions: RFC 9728 discovery, a bearer
 * challenge, audience-bound token verification, and per-tool scope checks.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";

import { DemoStore } from "./demo-data.js";
import { createNamoIDMcpAuth, requireScopes, type NamoIDMcpAuth } from "./namoid-mcp-auth.js";

/** Scope names are customer-defined. These match the ones registered in NamoID. */
const SCOPE_CUSTOMERS_READ = "customers:read";
const SCOPE_INVOICES_READ = "invoices:read";
const SCOPE_INVOICES_CREATE = "invoices:create";
const SCOPE_REFUNDS_CREATE = "refunds:create";

/**
 * Only the read scopes are advertised for an initial connection. `create` and
 * `refunds:create` are requested incrementally, so a first consent screen
 * never asks a user to pre-approve moving money.
 */
const INITIAL_SCOPES = [SCOPE_CUSTOMERS_READ, SCOPE_INVOICES_READ];

/** Acme's own policy ceiling. A scope alone never authorizes a refund. */
const REFUND_LIMIT_MINOR = 500_00;

const issuer = required("NAMOID_ISSUER");
const resource = required("NAMOID_MCP_RESOURCE");
const port = Number(process.env.PORT ?? "3004");
const store = new DemoStore();

const auth = await createNamoIDMcpAuth({
  issuer,
  resource,
  resourceName: process.env.NAMOID_MCP_RESOURCE_NAME ?? "Acme Finance MCP",
  scopesSupported: INITIAL_SCOPES,
});

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    // This process serves JSON and metadata, never HTML, so a CSP has nothing
    // to constrain. HSTS belongs on a real HTTPS deployment but would be wrong
    // to send from a plain-http local run.
    contentSecurityPolicy: false,
    strictTransportSecurity: resource.startsWith("https://") ? undefined : false,
  }),
);
app.use((_request, response, next) => {
  response.setHeader("cache-control", "no-store");
  next();
});

// Liveness only. Never behind auth, never reveals configuration.
app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

/**
 * RFC 9728 protected-resource metadata. This is the document an MCP client
 * fetches after its first `401`, and it is how the client learns that NamoID
 * is the authorization server for this MCP server.
 *
 * The path is derived from the canonical resource URL: a resource at
 * `https://mcp.acme.example/mcp` publishes at
 * `https://mcp.acme.example/.well-known/oauth-protected-resource/mcp`.
 */
app.get(auth.protectedResourceMetadataPath, cors, (_request, response) => {
  response.setHeader("cache-control", "public, max-age=300");
  response.json(auth.protectedResourceMetadata);
});
app.options(auth.protectedResourceMetadataPath, cors, (_request, response) => {
  response.status(204).end();
});

const mcpRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

/**
 * The MCP endpoint.
 *
 * `requireBearerAuth` answers an unauthenticated call with `401` and
 * `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="..."`,
 * which is what starts the whole discovery flow. No `requiredScopes` is set
 * here on purpose: connecting needs a valid token, not every scope. Individual
 * tools enforce their own.
 */
app.post(
  "/mcp",
  mcpRateLimit,
  requireBearerAuth({
    verifier: auth.verifier,
    resourceMetadataUrl: auth.protectedResourceMetadataUrl,
  }),
  express.json({ limit: "1mb" }),
  asyncRoute(async (request, response) => {
    // Stateless: a fresh server and transport per request, so no session state
    // is shared between two different users' tokens.
    const server = buildServer(auth);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    response.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  }),
);

// Stateless mode has no stream to resume and no session to delete.
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error("MCP request failed", safeError(error));
  if (response.headersSent) return;
  response.status(500).json({
    jsonrpc: "2.0",
    error: { code: -32603, message: "Internal server error" },
    id: null,
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Acme Finance MCP server listening on http://0.0.0.0:${port}`);
  console.log(`  MCP endpoint      ${resource}`);
  console.log(`  Resource metadata ${auth.protectedResourceMetadataUrl}`);
  console.log(`  Authorization     ${auth.authorizationServer.issuer}`);
  console.log(`  Initial scopes    ${INITIAL_SCOPES.join(" ")}`);
});

function buildServer(auth: NamoIDMcpAuth): McpServer {
  const server = new McpServer(
    { name: "acme-finance-mcp", version: "0.1.0" },
    { instructions: "Read and manage Acme Finance customers, invoices, and refunds." },
  );

  server.registerTool(
    "find_customer",
    {
      title: "Find customer",
      description: "Search customers available to the signed-in user by name or email.",
      inputSchema: { query: z.string().min(1).max(120).describe("Name or email fragment") },
      annotations: { readOnlyHint: true },
    },
    requireScopes<{ query: string }>(auth, [SCOPE_CUSTOMERS_READ], async ({ query }, caller) => {
      const customers = store.findCustomers(caller.subject, query);
      return {
        content: [{ type: "text", text: `Found ${customers.length} customer(s).` }],
        structuredContent: { customers: customers.map(publicCustomer) },
      };
    }),
  );

  server.registerTool(
    "list_invoices",
    {
      title: "List invoices",
      description: "List invoices available to the signed-in user.",
      inputSchema: { status: z.enum(["open", "paid", "refunded"]).optional() },
      annotations: { readOnlyHint: true },
    },
    requireScopes<{ status?: "open" | "paid" | "refunded" }>(
      auth,
      [SCOPE_INVOICES_READ],
      async ({ status }, caller) => {
        const invoices = store.listInvoices(caller.subject, status);
        return {
          content: [{ type: "text", text: `Found ${invoices.length} invoice(s).` }],
          structuredContent: { invoices: invoices.map(publicInvoice) },
        };
      },
    ),
  );

  server.registerTool(
    "create_invoice",
    {
      title: "Create invoice",
      description: "Create an invoice for a customer as the signed-in user.",
      inputSchema: {
        customerId: z.string().min(1).max(64),
        amountMinor: z.number().int().positive().max(100_000_00),
        currency: z.string().length(3).default("INR"),
      },
    },
    requireScopes<{ customerId: string; amountMinor: number; currency: string }>(
      auth,
      [SCOPE_INVOICES_CREATE],
      async ({ customerId, amountMinor, currency }, caller) => {
        // Scope says "may create invoices". It does not say "for this customer".
        const owned = store.findCustomers(caller.subject, "").some((c) => c.id === customerId);
        if (!owned) {
          return toolError(`Customer ${customerId} is not available to this account.`);
        }
        const invoice = store.createInvoice(caller.subject, { customerId, amountMinor, currency });
        return {
          content: [{ type: "text", text: `Created invoice ${invoice.id}.` }],
          structuredContent: { invoice: publicInvoice(invoice) },
        };
      },
    ),
  );

  server.registerTool(
    "issue_refund",
    {
      title: "Issue refund",
      description: "Refund a paid invoice. Requires elevated authorization.",
      inputSchema: {
        invoiceId: z.string().min(1).max(64),
        amountMinor: z.number().int().positive(),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    requireScopes<{ invoiceId: string; amountMinor: number }>(
      auth,
      [SCOPE_REFUNDS_CREATE],
      async ({ invoiceId, amountMinor }, caller) => {
        // Everything below is business authorization the scope cannot express.
        const invoice = store.getInvoice(caller.subject, invoiceId);
        if (!invoice) {
          return toolError(`Invoice ${invoiceId} is not available to this account.`);
        }
        if (invoice.status !== "paid") {
          return toolError(`Invoice ${invoiceId} is ${invoice.status} and cannot be refunded.`);
        }
        if (amountMinor > invoice.amountMinor) {
          return toolError("Refund amount exceeds the invoice total.");
        }
        if (amountMinor > REFUND_LIMIT_MINOR) {
          return toolError("Refund amount exceeds the account refund limit.");
        }

        store.markRefunded(caller.subject, invoiceId);
        // A real server records the domain action in its own audit log here.
        console.log(
          JSON.stringify({
            event: "refund.issued",
            invoice_id: invoiceId,
            amount_minor: amountMinor,
            subject: caller.subject,
            client_id: caller.clientId,
          }),
        );
        return {
          content: [{ type: "text", text: `Refunded ${amountMinor} on invoice ${invoiceId}.` }],
          structuredContent: { invoiceId, amountMinor, status: "refunded" },
        };
      },
    ),
  );

  return server;
}

function publicCustomer(customer: { id: string; name: string; email: string }) {
  return { id: customer.id, name: customer.name, email: customer.email };
}

function publicInvoice(invoice: {
  id: string;
  customerId: string;
  amountMinor: number;
  currency: string;
  status: string;
}) {
  return {
    id: invoice.id,
    customerId: invoice.customerId,
    amountMinor: invoice.amountMinor,
    currency: invoice.currency,
    status: invoice.status,
  };
}

function toolError(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

/**
 * Discovery is fetched cross-origin by browser-based MCP clients, so the
 * metadata document — and only that document — is world-readable.
 */
function cors(_request: Request, response: Response, next: NextFunction) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type, authorization, mcp-protocol-version");
  next();
}

function methodNotAllowed(_request: Request, response: Response) {
  response.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed" },
    id: null,
  });
}

function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>,
) {
  return (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next);
  };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}
