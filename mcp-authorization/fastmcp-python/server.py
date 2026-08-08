"""Acme Finance MCP server, protected by NamoID.

Four tools, four scopes, one canonical resource URL. ``create_namoid_auth``
below is what turns this into an OAuth protected resource: RFC 9728 discovery,
a bearer challenge, audience-bound token verification, and per-tool scopes.

Run it with:  fastmcp run server.py   (or: python server.py)
"""

from __future__ import annotations

import json
import os
import sys
from typing import Annotated

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from fastmcp.server.dependencies import get_access_token
from pydantic import Field

from demo_store import DemoStore, InvoiceStatus
from namoid_mcp_auth import create_namoid_auth, require_namoid_scopes

# Scope names are customer-defined. These match the ones registered in NamoID.
SCOPE_CUSTOMERS_READ = "customers:read"
SCOPE_INVOICES_READ = "invoices:read"
SCOPE_INVOICES_CREATE = "invoices:create"
SCOPE_REFUNDS_CREATE = "refunds:create"

# Only the read scopes are advertised for an initial connection. `create` and
# `refunds:create` are requested incrementally, so a first consent screen never
# asks a user to pre-approve moving money.
INITIAL_SCOPES = [SCOPE_CUSTOMERS_READ, SCOPE_INVOICES_READ]

# Acme's own policy ceiling. A scope alone never authorizes a refund.
REFUND_LIMIT_MINOR = 50_000


def _required_env(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        raise SystemExit(f"{name} is required. Copy .env.example to .env and fill it in.")
    return value


try:
    auth = create_namoid_auth(
        issuer=_required_env("NAMOID_ISSUER"),
        resource=_required_env("NAMOID_MCP_RESOURCE"),
        resource_name=os.environ.get("NAMOID_MCP_RESOURCE_NAME", "Acme Finance MCP"),
        scopes_supported=INITIAL_SCOPES,
    )
except ValueError as exc:
    # Configuration errors are fatal and readable, not a mystery 401 later.
    raise SystemExit(f"NamoID MCP authorization is not configured correctly: {exc}") from exc

store = DemoStore()
mcp = FastMCP(
    name="acme-finance-mcp",
    instructions="Read and manage Acme Finance customers, invoices, and refunds.",
    auth=auth.provider,
)


def _caller_subject() -> str:
    """The NamoID user who consented — never the MCP host or the client app."""
    subject = get_access_token().subject
    if not subject:
        # The verifier rejects a token with no `sub`, so this is unreachable.
        # Failing loudly beats defaulting to a shared anonymous identity.
        raise RuntimeError("authenticated token has no subject")
    return subject


@mcp.tool(annotations={"readOnlyHint": True})
@require_namoid_scopes(auth, SCOPE_CUSTOMERS_READ)
def find_customer(
    query: Annotated[str, Field(min_length=1, max_length=120, description="Name or email fragment")],
) -> dict[str, object]:
    """Search customers available to the signed-in user by name or email."""
    customers = store.find_customers(_caller_subject(), query)
    return {"customers": [customer.public() for customer in customers]}


@mcp.tool(annotations={"readOnlyHint": True})
@require_namoid_scopes(auth, SCOPE_INVOICES_READ)
def list_invoices(status: InvoiceStatus | None = None) -> dict[str, object]:
    """List invoices available to the signed-in user."""
    invoices = store.list_invoices(_caller_subject(), status)
    return {"invoices": [invoice.public() for invoice in invoices]}


@mcp.tool
@require_namoid_scopes(auth, SCOPE_INVOICES_CREATE)
def create_invoice(
    customer_id: Annotated[str, Field(min_length=1, max_length=64)],
    amount_minor: Annotated[int, Field(gt=0, le=10_000_000)],
    currency: Annotated[str, Field(min_length=3, max_length=3)] = "INR",
) -> dict[str, object]:
    """Create an invoice for a customer as the signed-in user."""
    subject = _caller_subject()
    # Scope says "may create invoices". It does not say "for this customer".
    if not any(c.id == customer_id for c in store.find_customers(subject)):
        raise ToolError(f"Customer {customer_id} is not available to this account.")
    invoice = store.create_invoice(
        subject, customer_id=customer_id, amount_minor=amount_minor, currency=currency
    )
    return {"invoice": invoice.public()}


@mcp.tool(annotations={"destructiveHint": True, "idempotentHint": False})
@require_namoid_scopes(auth, SCOPE_REFUNDS_CREATE)
def issue_refund(
    invoice_id: Annotated[str, Field(min_length=1, max_length=64)],
    amount_minor: Annotated[int, Field(gt=0)],
) -> dict[str, object]:
    """Refund a paid invoice. Requires elevated authorization."""
    token = get_access_token()
    subject = _caller_subject()

    # Everything below is business authorization the scope cannot express.
    invoice = store.get_invoice(subject, invoice_id)
    if invoice is None:
        raise ToolError(f"Invoice {invoice_id} is not available to this account.")
    if invoice.status != "paid":
        raise ToolError(f"Invoice {invoice_id} is {invoice.status} and cannot be refunded.")
    if amount_minor > invoice.amount_minor:
        raise ToolError("Refund amount exceeds the invoice total.")
    if amount_minor > REFUND_LIMIT_MINOR:
        raise ToolError("Refund amount exceeds the account refund limit.")

    store.mark_refunded(subject, invoice_id)
    # A real server records the domain action in its own audit log here.
    print(
        json.dumps(
            {
                "event": "refund.issued",
                "invoice_id": invoice_id,
                "amount_minor": amount_minor,
                "subject": subject,
                "client_id": token.client_id,
            }
        ),
        file=sys.stderr,
        flush=True,
    )
    return {"invoiceId": invoice_id, "amountMinor": amount_minor, "status": "refunded"}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3005"))
    print(f"Acme Finance MCP server listening on http://0.0.0.0:{port}", file=sys.stderr)
    print(f"  MCP endpoint      {auth.resource}", file=sys.stderr)
    print(f"  Resource metadata {auth.metadata_path}", file=sys.stderr)
    print(f"  Authorization     {auth.issuer}", file=sys.stderr)
    print(f"  Initial scopes    {' '.join(auth.scopes_supported)}", file=sys.stderr)
    mcp.run(transport="http", host="0.0.0.0", port=port, path=auth.mcp_path)
