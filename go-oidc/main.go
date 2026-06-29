package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// loginState holds the per-request CSRF state, OIDC nonce, and PKCE verifier
// while the user is away authenticating on NamoID. It is keyed by a random
// cookie value and lives only until the callback completes.
type loginState struct {
	State    string
	Nonce    string
	Verifier string
	Created  time.Time
}

// userClaims is the subset of OIDC claims we care about for the demo.
type userClaims struct {
	Subject       string `json:"sub"`
	Name          string `json:"name"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Picture       string `json:"picture"`
	Nonce         string `json:"nonce"`
}

// sessionStore is a tiny in-memory map of cookie-id -> data. Fine for a
// single-process demo; a real app would use Redis or signed cookies.
type sessionStore struct {
	mu      sync.Mutex
	logins  map[string]loginState
	profile map[string]userClaims
}

func newSessionStore() *sessionStore {
	return &sessionStore{
		logins:  make(map[string]loginState),
		profile: make(map[string]userClaims),
	}
}

const (
	loginCookie   = "namoid_login"
	sessionCookie = "namoid_session"
	loginTTL      = 10 * time.Minute
)

type app struct {
	oauth2Config oauth2.Config
	verifier     *oidc.IDTokenVerifier
	provider     *oidc.Provider
	clientID     string
	store        *sessionStore
	tmpl         *template.Template
}

func main() {
	issuer := mustEnv("NAMOID_ISSUER")
	clientID := mustEnv("NAMOID_CLIENT_ID")
	clientSecret := mustEnv("NAMOID_CLIENT_SECRET")
	redirectURI := mustEnv("NAMOID_REDIRECT_URI")

	port := os.Getenv("PORT")
	if port == "" {
		port = "3005"
	}

	ctx := context.Background()

	// Discover authorize/token/userinfo/jwks endpoints from the issuer.
	// We never hardcode them — OIDC Discovery is the contract.
	provider, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		log.Fatalf("failed to discover NamoID OIDC provider at %s: %v", issuer, err)
	}

	a := &app{
		oauth2Config: oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURI,
			Endpoint:     provider.Endpoint(),
			Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
		},
		verifier: provider.Verifier(&oidc.Config{ClientID: clientID}),
		provider: provider,
		clientID: clientID,
		store:    newSessionStore(),
		tmpl:     template.Must(template.New("").Parse(pageTemplates)),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", a.handleHome)
	mux.HandleFunc("/login", a.handleLogin)
	mux.HandleFunc("/callback", a.handleCallback)
	mux.HandleFunc("/profile", a.handleProfile)
	mux.HandleFunc("/logout", a.handleLogout)

	addr := ":" + port
	log.Printf("NamoID Go quickstart listening on http://localhost%s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func (a *app) handleHome(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	claims, ok := a.currentUser(r)
	a.render(w, "home", map[string]any{
		"LoggedIn": ok,
		"User":     claims,
	})
}

func (a *app) handleLogin(w http.ResponseWriter, r *http.Request) {
	state := randomString()
	nonce := randomString()
	verifier := oauth2.GenerateVerifier()

	id := randomString()
	a.store.mu.Lock()
	a.store.logins[id] = loginState{
		State:    state,
		Nonce:    nonce,
		Verifier: verifier,
		Created:  time.Now(),
	}
	a.store.mu.Unlock()

	http.SetCookie(w, &http.Cookie{
		Name:     loginCookie,
		Value:    id,
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(loginTTL.Seconds()),
	})

	// PKCE S256 challenge + nonce are bound into the authorize request.
	authURL := a.oauth2Config.AuthCodeURL(
		state,
		oidc.Nonce(nonce),
		oauth2.S256ChallengeOption(verifier),
	)
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (a *app) handleCallback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	cookie, err := r.Cookie(loginCookie)
	if err != nil {
		http.Error(w, "missing login cookie — start at /login", http.StatusBadRequest)
		return
	}

	a.store.mu.Lock()
	login, ok := a.store.logins[cookie.Value]
	delete(a.store.logins, cookie.Value)
	a.store.mu.Unlock()
	if !ok || time.Since(login.Created) > loginTTL {
		http.Error(w, "login session expired — start at /login", http.StatusBadRequest)
		return
	}

	if errParam := r.URL.Query().Get("error"); errParam != "" {
		http.Error(w, "authorization failed: "+errParam+" — "+r.URL.Query().Get("error_description"), http.StatusBadRequest)
		return
	}

	if r.URL.Query().Get("state") != login.State {
		http.Error(w, "state mismatch — possible CSRF", http.StatusBadRequest)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "missing authorization code", http.StatusBadRequest)
		return
	}

	// Exchange the code for tokens, sending the PKCE verifier.
	token, err := a.oauth2Config.Exchange(ctx, code, oauth2.VerifierOption(login.Verifier))
	if err != nil {
		http.Error(w, "token exchange failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		http.Error(w, "no id_token in token response", http.StatusBadGateway)
		return
	}

	idToken, err := a.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		http.Error(w, "id_token verification failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	var claims userClaims
	if err := idToken.Claims(&claims); err != nil {
		http.Error(w, "failed to parse id_token claims: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if claims.Nonce != login.Nonce {
		http.Error(w, "nonce mismatch — possible token replay", http.StatusBadRequest)
		return
	}

	// Optionally enrich from the userinfo endpoint. The id_token already has
	// what we need, so failures here are non-fatal.
	if info, err := a.provider.UserInfo(ctx, oauth2.StaticTokenSource(token)); err == nil {
		var extra userClaims
		if err := info.Claims(&extra); err == nil {
			mergeClaims(&claims, extra)
		}
	}

	sid := randomString()
	a.store.mu.Lock()
	a.store.profile[sid] = claims
	a.store.mu.Unlock()

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    sid,
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int((24 * time.Hour).Seconds()),
	})
	http.SetCookie(w, &http.Cookie{Name: loginCookie, Value: "", Path: "/", MaxAge: -1})

	http.Redirect(w, r, "/profile", http.StatusFound)
}

func (a *app) handleProfile(w http.ResponseWriter, r *http.Request) {
	claims, ok := a.currentUser(r)
	if !ok {
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}
	pretty, _ := json.MarshalIndent(claims, "", "  ")
	a.render(w, "profile", map[string]any{
		"User":   claims,
		"Claims": string(pretty),
	})
}

func (a *app) handleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		a.store.mu.Lock()
		delete(a.store.profile, cookie.Value)
		a.store.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1})
	http.Redirect(w, r, "/", http.StatusFound)
}

func (a *app) currentUser(r *http.Request) (userClaims, bool) {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return userClaims{}, false
	}
	a.store.mu.Lock()
	claims, ok := a.store.profile[cookie.Value]
	a.store.mu.Unlock()
	return claims, ok
}

func (a *app) render(w http.ResponseWriter, name string, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := a.tmpl.ExecuteTemplate(w, name, data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func mergeClaims(dst *userClaims, src userClaims) {
	if dst.Name == "" {
		dst.Name = src.Name
	}
	if dst.Email == "" {
		dst.Email = src.Email
	}
	if dst.Picture == "" {
		dst.Picture = src.Picture
	}
	if !dst.EmailVerified {
		dst.EmailVerified = src.EmailVerified
	}
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("missing required env var %s — see .env.example", key)
	}
	return v
}

func randomString() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(fmt.Sprintf("crypto/rand failed: %v", err))
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

const pageTemplates = `
{{define "layout"}}<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NamoID + Go quickstart</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; }
  a.button { display: inline-block; background: #111; color: #fff; padding: .6rem 1.1rem; border-radius: 8px; text-decoration: none; }
  a.button.secondary { background: #eee; color: #111; }
  pre { background: #f6f6f6; padding: 1rem; border-radius: 8px; overflow: auto; }
  img.avatar { width: 64px; height: 64px; border-radius: 50%; vertical-align: middle; }
</style>
</head>
<body>{{template "body" .}}</body>
</html>{{end}}

{{define "home"}}{{template "layout" .}}{{end}}
{{define "profile"}}{{template "layout" .}}{{end}}

{{define "body"}}
{{if .Claims}}
  <h1>Your NamoID profile</h1>
  {{with .User}}
    {{if .Picture}}<p><img class="avatar" src="{{.Picture}}" alt=""></p>{{end}}
    <p><strong>{{.Name}}</strong><br>{{.Email}}{{if .EmailVerified}} ✓{{end}}</p>
  {{end}}
  <h2>Verified ID token claims</h2>
  <pre>{{.Claims}}</pre>
  <p><a class="button secondary" href="/logout">Sign out</a></p>
{{else}}
  <h1>NamoID + Go quickstart</h1>
  <p>Sign in with NamoID using OAuth 2.1 + OIDC (Authorization Code + PKCE).</p>
  {{if .LoggedIn}}
    <p>You're signed in as <strong>{{.User.Name}}</strong>.</p>
    <p><a class="button" href="/profile">View profile</a> <a class="button secondary" href="/logout">Sign out</a></p>
  {{else}}
    <p><a class="button" href="/login">Sign in with NamoID</a></p>
  {{end}}
{{end}}
{{end}}
`
