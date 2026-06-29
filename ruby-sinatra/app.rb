# frozen_string_literal: true

require 'sinatra'
require 'securerandom'
require 'digest'
require 'base64'
require 'json'
require 'net/http'
require 'uri'
require 'dotenv/load'
require 'openid_connect'

ISSUER        = ENV.fetch('NAMOID_ISSUER')
CLIENT_ID     = ENV.fetch('NAMOID_CLIENT_ID')
CLIENT_SECRET = ENV.fetch('NAMOID_CLIENT_SECRET')
REDIRECT_URI  = ENV.fetch('NAMOID_REDIRECT_URI', 'http://localhost:3006/callback')
SCOPE         = 'openid profile email'

set :port, ENV.fetch('PORT', '3006').to_i
set :bind, '0.0.0.0'

enable :sessions
set :session_secret, ENV.fetch('SESSION_SECRET', SecureRandom.hex(32))

# Discover the OpenID provider configuration once from the issuer.
# Endpoints (authorize / token / userinfo / jwks) are never hardcoded.
def discovery
  @discovery ||= OpenIDConnect::Discovery::Provider::Config.discover!(ISSUER)
end

def base64url_no_pad(bytes)
  Base64.urlsafe_encode64(bytes, padding: false)
end

# --- PKCE (RFC 7636, S256) -------------------------------------------------
def generate_code_verifier
  SecureRandom.urlsafe_base64(64)
end

def code_challenge_for(verifier)
  base64url_no_pad(Digest::SHA256.digest(verifier))
end

# --- Routes ----------------------------------------------------------------

get '/' do
  @user = session[:claims]
  erb :home
end

get '/login' do
  state         = SecureRandom.urlsafe_base64(32)
  nonce         = SecureRandom.urlsafe_base64(32)
  code_verifier = generate_code_verifier

  session[:state]         = state
  session[:nonce]         = nonce
  session[:code_verifier] = code_verifier

  authorize_uri = URI(discovery.authorization_endpoint)
  authorize_uri.query = URI.encode_www_form(
    response_type:         'code',
    client_id:             CLIENT_ID,
    redirect_uri:          REDIRECT_URI,
    scope:                 SCOPE,
    state:                 state,
    nonce:                 nonce,
    code_challenge:        code_challenge_for(code_verifier),
    code_challenge_method: 'S256'
  )

  redirect authorize_uri.to_s
end

get '/callback' do
  halt 400, error_page('Provider returned an error', params[:error_description] || params[:error]) if params[:error]
  halt 400, error_page('Missing authorization code', 'No ?code= in the callback.') unless params[:code]

  unless params[:state] && params[:state] == session[:state]
    halt 400, error_page('State mismatch', 'The state value did not match the one stored in the session (possible CSRF).')
  end

  code_verifier = session.delete(:code_verifier)
  nonce         = session.delete(:nonce)
  session.delete(:state)

  tokens = exchange_code(params[:code], code_verifier)

  id_token = OpenIDConnect::ResponseObject::IdToken.decode(
    tokens['id_token'],
    discovery.jwks
  )
  id_token.verify!(
    issuer:   ISSUER,
    client_id: CLIENT_ID,
    nonce:    nonce
  )

  claims = userinfo(tokens['access_token']) || id_token.raw_attributes
  session[:claims] = claims.merge('sub' => id_token.sub)

  redirect '/profile'
rescue OpenIDConnect::ResponseObject::IdToken::InvalidToken => e
  halt 400, error_page('Invalid id_token', e.message)
end

get '/profile' do
  redirect '/login' unless session[:claims]
  @user = session[:claims]
  erb :profile
end

get '/logout' do
  session.clear
  redirect '/'
end

# --- HTTP helpers ----------------------------------------------------------

# Authorization Code exchange with PKCE verifier + confidential client
# (client_secret_basic) at the discovered token endpoint.
def exchange_code(code, code_verifier)
  uri = URI(discovery.token_endpoint)
  req = Net::HTTP::Post.new(uri)
  req.basic_auth(CLIENT_ID, CLIENT_SECRET)
  req.set_form_data(
    grant_type:    'authorization_code',
    code:          code,
    redirect_uri:  REDIRECT_URI,
    code_verifier: code_verifier
  )

  res = http_request(uri, req)
  body = JSON.parse(res.body)
  halt 400, error_page('Token exchange failed', body.to_json) unless res.is_a?(Net::HTTPSuccess)
  body
end

def userinfo(access_token)
  return nil unless discovery.userinfo_endpoint

  uri = URI(discovery.userinfo_endpoint)
  req = Net::HTTP::Get.new(uri)
  req['Authorization'] = "Bearer #{access_token}"

  res = http_request(uri, req)
  res.is_a?(Net::HTTPSuccess) ? JSON.parse(res.body) : nil
end

def http_request(uri, req)
  Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == 'https') do |http|
    http.request(req)
  end
end

def error_page(title, detail)
  "<h1>#{Rack::Utils.escape_html(title)}</h1><pre>#{Rack::Utils.escape_html(detail.to_s)}</pre><p><a href=\"/\">Home</a></p>"
end

# --- Views -----------------------------------------------------------------

__END__

@@ layout
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NamoID + Sinatra quickstart</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; }
    a.button { display: inline-block; background: #111; color: #fff; padding: .6rem 1.2rem; border-radius: 8px; text-decoration: none; }
    pre { background: #f4f4f5; padding: 1rem; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <%= yield %>
</body>
</html>

@@ home
<h1>NamoID + Sinatra quickstart</h1>
<% if @user %>
  <p>Signed in as <strong><%= Rack::Utils.escape_html(@user['name'] || @user['email'] || @user['sub']) %></strong>.</p>
  <p><a class="button" href="/profile">View profile</a> &middot; <a href="/logout">Sign out</a></p>
<% else %>
  <p>You are not signed in.</p>
  <p><a class="button" href="/login">Sign in with NamoID</a></p>
<% end %>

@@ profile
<h1>Profile</h1>
<p>These are the OIDC claims for the signed-in user.</p>
<pre><%= Rack::Utils.escape_html(JSON.pretty_generate(@user)) %></pre>
<p><a href="/logout">Sign out</a> &middot; <a href="/">Home</a></p>
