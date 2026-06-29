from __future__ import annotations

import os

from authlib.integrations.starlette_client import OAuth, OAuthError
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

load_dotenv()

NAMOID_ISSUER = os.environ["NAMOID_ISSUER"]
NAMOID_CLIENT_ID = os.environ["NAMOID_CLIENT_ID"]
NAMOID_CLIENT_SECRET = os.environ["NAMOID_CLIENT_SECRET"]
NAMOID_REDIRECT_URI = os.environ["NAMOID_REDIRECT_URI"]
SESSION_SECRET = os.environ["SESSION_SECRET"]
PORT = int(os.environ.get("PORT", "3004"))

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET)

oauth = OAuth()
oauth.register(
    name="namoid",
    server_metadata_url=f"{NAMOID_ISSUER}/.well-known/openid-configuration",
    client_id=NAMOID_CLIENT_ID,
    client_secret=NAMOID_CLIENT_SECRET,
    client_kwargs={
        "scope": "openid profile email",
        "code_challenge_method": "S256",
    },
)


def _page(body: str) -> HTMLResponse:
    return HTMLResponse(
        f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>NamoID + FastAPI quickstart</title>
    <style>
      body {{ font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; }}
      a.button {{ display: inline-block; padding: 0.6rem 1rem; background: #111; color: #fff;
                  border-radius: 0.5rem; text-decoration: none; }}
      pre {{ background: #f4f4f5; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }}
    </style>
  </head>
  <body>{body}</body>
</html>"""
    )


@app.get("/")
async def home(request: Request) -> HTMLResponse:
    user = request.session.get("user")
    if user:
        name = user.get("name") or user.get("email") or user.get("sub")
        return _page(
            f"<h1>NamoID + FastAPI quickstart</h1>"
            f"<p>Signed in as <strong>{name}</strong> ({user.get('email')})</p>"
            f'<p><a class="button" href="/profile">View profile</a> '
            f'<a href="/logout">Sign out</a></p>'
        )
    return _page(
        "<h1>NamoID + FastAPI quickstart</h1>"
        "<p>You are not signed in.</p>"
        '<p><a class="button" href="/login">Sign in with NamoID</a></p>'
    )


@app.get("/login")
async def login(request: Request) -> RedirectResponse:
    return await oauth.namoid.authorize_redirect(request, NAMOID_REDIRECT_URI)


@app.get("/callback")
async def callback(request: Request) -> RedirectResponse | HTMLResponse:
    try:
        token = await oauth.namoid.authorize_access_token(request)
    except OAuthError as error:
        return _page(f"<h1>Sign-in failed</h1><pre>{error.error}: {error.description}</pre>")
    request.session["user"] = dict(token["userinfo"])
    return RedirectResponse(url="/profile")


@app.get("/profile")
async def profile(request: Request) -> HTMLResponse | RedirectResponse:
    user = request.session.get("user")
    if not user:
        return RedirectResponse(url="/login")
    rows = "".join(
        f"<tr><td><code>{key}</code></td><td>{value}</td></tr>" for key, value in user.items()
    )
    return _page(
        "<h1>Your NamoID profile</h1>"
        f"<table>{rows}</table>"
        '<p><a href="/logout">Sign out</a> · <a href="/">Home</a></p>'
    )


@app.get("/logout")
async def logout(request: Request) -> RedirectResponse:
    request.session.clear()
    return RedirectResponse(url="/")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=PORT, reload=True)
