"""NamoID authorization for a customer-owned FastMCP server.

NamoID is the authorization server. This process is the protected resource.
An MCP host (Claude, ChatGPT, Cursor, VS Code, MCP Inspector) is the OAuth
client. The signed-in human is the resource owner.

FastMCP already implements the resource-server half of the MCP authorization
profile: ``RemoteAuthProvider`` publishes RFC 9728 protected-resource metadata
and answers unauthenticated calls with a ``WWW-Authenticate`` challenge, and
``JWTVerifier`` validates signature, issuer, audience, and expiry against a
remote JWKS. This module supplies the two things specific to NamoID:

1.  discovery, so the JWKS URI and issuer come from the environment's own
    metadata document instead of being hard-coded, and
2.  the ``token_use`` check, because an ID token must never be accepted as an
    MCP API token even though it is an RS256 JWT from the same issuer.
"""

from __future__ import annotations

import functools
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, TypeVar
from urllib.parse import urlsplit

import httpx
from fastmcp.server.auth import AccessToken, RemoteAuthProvider
from fastmcp.server.auth.providers.jwt import JWTVerifier
from fastmcp.server.dependencies import get_access_token
from fastmcp.tools.tool import ToolResult
from pydantic import AnyHttpUrl
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

F = TypeVar("F", bound=Callable[..., Any])

# NamoID signs every environment's tokens with RS256. Nothing else is accepted.
_ALGORITHM = "RS256"

# Discovery must not hang server startup behind an unreachable issuer.
_DISCOVERY_TIMEOUT_SECONDS = 5.0

_LOCAL_HOSTNAMES = frozenset({"localhost", "127.0.0.1", "::1"})


class NamoIDAccessTokenVerifier(JWTVerifier):
    """``JWTVerifier`` plus the parts of NamoID's token contract it cannot know.

    ``JWTVerifier`` already rejects a bad signature, a wrong ``iss``, a wrong
    ``aud``, and an expired token. Two things are added here:

    ``token_use``
        ``JWTVerifier`` has no opinion on it, so an ID token for the same
        audience would otherwise be accepted as an MCP API token.

    ``subject``
        ``JWTVerifier`` leaves ``AccessToken.subject`` unset. Without this, every
        caller looks like the same anonymous principal and per-user
        authorization in tool handlers silently applies to a shared identity.
    """

    async def verify_token(self, token: str) -> AccessToken | None:
        access_token = await super().verify_token(token)
        if access_token is None:
            return None
        if access_token.claims.get("token_use") != "access":
            return None
        subject = access_token.claims.get("sub")
        if not isinstance(subject, str) or not subject:
            return None
        return access_token.model_copy(update={"subject": subject})


class _ExactIssuerRemoteAuthProvider(RemoteAuthProvider):
    """``RemoteAuthProvider`` that publishes the issuer string verbatim.

    ``RemoteAuthProvider`` stores authorization servers as pydantic
    ``AnyHttpUrl``, which appends a trailing slash to a bare-authority URL:
    ``https://acme-test.id.namoid.in`` is serialized as
    ``https://acme-test.id.namoid.in/``. NamoID's discovery document declares
    the issuer *without* that slash, and RFC 8414 compares issuer identifiers
    exactly, so a strict client that fetches the advertised authorization
    server and compares the returned ``issuer`` would see a mismatch. Clients
    that build the well-known URL by string concatenation would also produce a
    double slash.

    Everything else — token verification and the ``WWW-Authenticate``
    challenge — is inherited unchanged; only the served document is replaced.
    """

    def __init__(self, *, metadata: dict[str, Any], metadata_path: str, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._metadata = metadata
        self._metadata_path = metadata_path

    def get_routes(self, mcp_path: str | None = None) -> list[Route]:
        # Preserve the lifecycle hook the base class documents before returning
        # routes, then publish our own metadata document.
        self.set_mcp_path(mcp_path)

        async def protected_resource_metadata(_request: Request) -> JSONResponse:
            return JSONResponse(
                self._metadata,
                headers={
                    "Cache-Control": "public, max-age=300",
                    # Browser-based MCP clients fetch discovery cross-origin.
                    # Only this document is world-readable.
                    "Access-Control-Allow-Origin": "*",
                },
            )

        return [
            Route(
                self._metadata_path,
                protected_resource_metadata,
                methods=["GET", "OPTIONS"],
            )
        ]


@dataclass(frozen=True)
class NamoIDMcpAuth:
    """Everything the server needs to mount itself as a protected resource."""

    provider: RemoteAuthProvider
    """Pass to ``FastMCP(auth=...)``."""

    issuer: str
    """The NamoID environment issuer that authorizes this server."""

    resource: str
    """Canonical MCP URL, and the exact ``aud`` every accepted token carries."""

    resource_origin: str
    """Scheme and authority of ``resource``, used to build absolute metadata URLs."""

    mcp_path: str
    """Path the MCP endpoint must be served on, derived from ``resource``."""

    metadata_path: str
    """Where RFC 9728 metadata is published, derived from ``resource``."""

    scopes_supported: tuple[str, ...]
    """Scopes advertised for an ordinary first connection."""


def create_namoid_auth(
    *,
    issuer: str,
    resource: str,
    scopes_supported: list[str],
    resource_name: str | None = None,
) -> NamoIDMcpAuth:
    """Verify NamoID discovery and build a protected-resource auth provider.

    Args:
        issuer: The NamoID environment issuer, for example
            ``https://acme-test.id.namoid.in``. Test and Live differ.
        resource: The canonical public URL of this MCP server, exactly as
            registered as the resource audience in NamoID. Tokens carry this
            string in ``aud``, so a mismatch rejects every token.
        scopes_supported: Scopes advertised for an initial connection. Keep this
            minimal; request sensitive write scopes incrementally instead.
        resource_name: Human-readable name shown during discovery and consent.

    Raises:
        ValueError: If the issuer or resource URL is unusable, or if discovery
            does not describe the issuer that was asked for. Raised at startup
            so a misconfiguration is not an opaque 401 on the first tool call.
    """
    issuer = _validate_issuer(issuer)
    resource_parts = _validate_resource(resource)
    resource_url = resource_parts.geturl()
    origin = f"{resource_parts.scheme}://{resource_parts.netloc}"
    mcp_path = resource_parts.path or "/"

    jwks_uri = _discover_jwks_uri(issuer)

    verifier = NamoIDAccessTokenVerifier(
        jwks_uri=jwks_uri,
        issuer=issuer,
        audience=resource_url,
        algorithm=_ALGORITHM,
        # Connecting needs a valid token, not every scope. Individual tools
        # enforce their own scopes so a read-only client can still connect.
        required_scopes=None,
    )

    metadata_path = _metadata_path(mcp_path)
    metadata: dict[str, Any] = {
        "resource": resource_url,
        "authorization_servers": [issuer],
        "scopes_supported": list(scopes_supported),
        "bearer_methods_supported": ["header"],
    }
    if resource_name is not None:
        metadata["resource_name"] = resource_name

    provider = _ExactIssuerRemoteAuthProvider(
        metadata=metadata,
        metadata_path=metadata_path,
        token_verifier=verifier,
        authorization_servers=[AnyHttpUrl(issuer)],
        base_url=origin,
        scopes_supported=list(scopes_supported),
        resource_name=resource_name,
    )

    return NamoIDMcpAuth(
        provider=provider,
        issuer=issuer,
        resource=resource_url,
        resource_origin=origin,
        mcp_path=mcp_path,
        metadata_path=metadata_path,
        scopes_supported=tuple(scopes_supported),
    )


def require_namoid_scopes(auth: NamoIDMcpAuth, *scopes: str) -> Callable[[F], F]:
    """Run a tool only when the caller's token carries every required scope.

    Prefer this over FastMCP's built-in ``require_scopes`` for MCP
    authorization. ``require_scopes`` *filters* the tool out of ``tools/list``
    for callers who lack the scope, so the host never learns the tool exists
    and cannot ask the user to approve it. Incremental authorization needs the
    opposite: the tool stays visible and an attempted call answers with an
    ``insufficient_scope`` challenge naming what is missing.

    A scope is permission to *attempt* an action. Business rules — ownership,
    organization boundaries, transaction limits — still belong in the tool body.
    """

    def decorate(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            granted = set(get_access_token().scopes)
            missing = [scope for scope in scopes if scope not in granted]
            if missing:
                return _insufficient_scope_result(auth, missing, sorted(granted))
            return func(*args, **kwargs)

        return wrapper  # type: ignore[return-value]

    return decorate


def _insufficient_scope_result(
    auth: NamoIDMcpAuth, missing_scopes: Sequence[str], granted_scopes: Sequence[str]
) -> ToolResult:
    """Tell the host which scopes are missing so it can elevate, not give up.

    The HTTP-level ``403`` + ``WWW-Authenticate`` challenge only applies to the
    whole endpoint. A single tool that needs an elevated scope has to answer
    inside the JSON-RPC response, so the same ``insufficient_scope`` error code
    and ``resource_metadata`` pointer are carried in structured content.
    """
    scope_list = " ".join(missing_scopes)
    metadata_url = f"{auth.resource_origin}{auth.metadata_path}"
    return ToolResult(
        content=(
            f"This action needs additional authorization. Missing scope(s): {scope_list}. "
            "Reconnect and approve the additional access to continue."
        ),
        structured_content={
            "error": "insufficient_scope",
            "required_scopes": list(missing_scopes),
            "granted_scopes": list(granted_scopes),
            "resource": auth.resource,
            "resource_metadata": metadata_url,
            "www_authenticate": (
                f'Bearer error="insufficient_scope", scope="{scope_list}", '
                f'resource_metadata="{metadata_url}"'
            ),
        },
        is_error=True,
    )


def _discover_jwks_uri(issuer: str) -> str:
    """Read the environment's RFC 8414 metadata and return its JWKS URI."""
    url = f"{issuer}/.well-known/oauth-authorization-server"
    try:
        response = httpx.get(
            url,
            headers={"accept": "application/json"},
            timeout=_DISCOVERY_TIMEOUT_SECONDS,
            follow_redirects=False,
        )
        response.raise_for_status()
        document = response.json()
    except httpx.HTTPError as exc:
        raise ValueError(f"could not reach {url}: {exc}") from exc

    if not isinstance(document, dict):
        raise ValueError(f"{url} did not return an OAuth metadata document")

    # RFC 9700 mix-up defence: the document must claim the issuer we asked for.
    declared_issuer = document.get("issuer")
    if declared_issuer != issuer:
        raise ValueError(
            f"issuer mismatch: NAMOID_ISSUER is {issuer} but {url} declares {declared_issuer}"
        )

    jwks_uri = document.get("jwks_uri")
    if not isinstance(jwks_uri, str) or not jwks_uri:
        raise ValueError(f"{url} does not advertise a jwks_uri")
    return jwks_uri


def _metadata_path(mcp_path: str) -> str:
    """RFC 9728 inserts the well-known segment between authority and path."""
    suffix = "" if mcp_path == "/" else mcp_path.rstrip("/")
    return f"/.well-known/oauth-protected-resource{suffix}"


def _validate_issuer(value: str) -> str:
    issuer = value.strip().rstrip("/")
    parts = urlsplit(issuer)
    if not parts.scheme or not parts.netloc:
        raise ValueError(f"NAMOID_ISSUER must be an absolute URL, received {value!r}")
    if parts.query or parts.fragment:
        raise ValueError("NAMOID_ISSUER must not contain a query string or fragment")
    if parts.scheme != "https" and not _is_local_hostname(parts.hostname):
        raise ValueError("NAMOID_ISSUER must use https outside local development")
    return issuer


def _validate_resource(value: str):
    parts = urlsplit(value.strip())
    if not parts.scheme or not parts.netloc:
        raise ValueError(f"NAMOID_MCP_RESOURCE must be an absolute URL, received {value!r}")
    if parts.fragment:
        # RFC 8707 resource indicators carry no fragment, and `aud` is compared
        # as an exact string.
        raise ValueError("NAMOID_MCP_RESOURCE must not contain a fragment")
    if parts.scheme != "https" and not _is_local_hostname(parts.hostname):
        raise ValueError("NAMOID_MCP_RESOURCE must use https outside local development")
    return parts


def _is_local_hostname(hostname: str | None) -> bool:
    if hostname is None:
        return False
    return hostname in _LOCAL_HOSTNAMES or hostname.endswith(".localhost")
