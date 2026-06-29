import os

from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv
from flask import Flask, redirect, render_template_string, session, url_for

load_dotenv()

NAMOID_ISSUER = os.environ["NAMOID_ISSUER"]
NAMOID_CLIENT_ID = os.environ["NAMOID_CLIENT_ID"]
NAMOID_CLIENT_SECRET = os.environ["NAMOID_CLIENT_SECRET"]
NAMOID_REDIRECT_URI = os.environ["NAMOID_REDIRECT_URI"]
PORT = int(os.environ.get("PORT", "3003"))

app = Flask(__name__)
app.secret_key = os.environ["FLASK_SECRET_KEY"]

oauth = OAuth(app)
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

HOME_TEMPLATE = """
<!doctype html>
<title>NamoID + Flask quickstart</title>
<h1>NamoID + Flask quickstart</h1>
{% if user %}
  <p>Signed in as <strong>{{ user.name or user.email }}</strong> ({{ user.email }}).</p>
  <p><a href="{{ url_for('profile') }}">View profile</a> &middot;
     <a href="{{ url_for('logout') }}">Sign out</a></p>
{% else %}
  <p><a href="{{ url_for('login') }}">Sign in with NamoID</a></p>
{% endif %}
"""

PROFILE_TEMPLATE = """
<!doctype html>
<title>Profile</title>
<h1>Your profile</h1>
<table>
  {% for key, value in claims.items() %}
  <tr><td><strong>{{ key }}</strong></td><td>{{ value }}</td></tr>
  {% endfor %}
</table>
<p><a href="{{ url_for('logout') }}">Sign out</a></p>
"""


@app.route("/")
def home():
    return render_template_string(HOME_TEMPLATE, user=session.get("user"))


@app.route("/login")
def login():
    return oauth.namoid.authorize_redirect(NAMOID_REDIRECT_URI)


@app.route("/callback")
def callback():
    token = oauth.namoid.authorize_access_token()
    session["user"] = token["userinfo"]
    return redirect(url_for("profile"))


@app.route("/profile")
def profile():
    user = session.get("user")
    if not user:
        return redirect(url_for("home"))
    return render_template_string(PROFILE_TEMPLATE, claims=user)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("home"))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)
