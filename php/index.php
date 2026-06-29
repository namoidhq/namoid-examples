<?php

declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

use Dotenv\Dotenv;
use Jumbojett\OpenIDConnectClient;

Dotenv::createImmutable(__DIR__)->safeLoad();

session_start();

/**
 * Build a NamoID-configured OIDC client.
 *
 * The library discovers the authorize / token / userinfo / jwks endpoints from
 * the issuer's /.well-known/openid-configuration document — nothing is hardcoded.
 */
function namoid_client(): OpenIDConnectClient
{
    $issuer = $_ENV['NAMOID_ISSUER'] ?? '';
    $clientId = $_ENV['NAMOID_CLIENT_ID'] ?? '';
    $clientSecret = $_ENV['NAMOID_CLIENT_SECRET'] ?? '';
    $redirectUri = $_ENV['NAMOID_REDIRECT_URI'] ?? 'http://localhost:3007/callback';

    if ($issuer === '' || $clientId === '' || $clientSecret === '') {
        http_response_code(500);
        exit('Missing NAMOID_ISSUER / NAMOID_CLIENT_ID / NAMOID_CLIENT_SECRET. Copy .env.example to .env and fill them in.');
    }

    $oidc = new OpenIDConnectClient($issuer, $clientId, $clientSecret);
    $oidc->setRedirectURL($redirectUri);

    // Authorization Code + PKCE with S256 is mandatory against NamoID.
    $oidc->setCodeChallengeMethod('S256');
    $oidc->addScope(['openid', 'profile', 'email']);

    return $oidc;
}

function redirect(string $path): never
{
    header('Location: ' . $path);
    exit;
}

function render(string $title, string $body): never
{
    header('Content-Type: text/html; charset=utf-8');
    echo <<<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{$title}</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1rem; }
  h1 { font-size: 1.4rem; }
  a.btn { display: inline-block; background: #111; color: #fff; padding: .6rem 1.1rem; border-radius: 8px; text-decoration: none; }
  a.btn:hover { background: #333; }
  pre { background: #f5f5f5; padding: 1rem; border-radius: 8px; overflow: auto; }
  .muted { color: #666; }
</style>
</head>
<body>
{$body}
</body>
</html>
HTML;
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

switch ($path) {
    case '/':
        if (isset($_SESSION['claims'])) {
            $claims = $_SESSION['claims'];
            $name = htmlspecialchars((string) ($claims['name'] ?? 'there'), ENT_QUOTES);
            $email = htmlspecialchars((string) ($claims['email'] ?? ''), ENT_QUOTES);
            render('NamoID quickstart', <<<HTML
<h1>Signed in</h1>
<p>Welcome, <strong>{$name}</strong> &lt;{$email}&gt;</p>
<p><a class="btn" href="/profile">View profile</a> &nbsp; <a href="/logout">Sign out</a></p>
HTML);
        }
        render('NamoID quickstart', <<<HTML
<h1>NamoID + PHP quickstart</h1>
<p class="muted">Authorization Code + PKCE via jumbojett/openid-connect-php.</p>
<p><a class="btn" href="/login">Sign in with NamoID</a></p>
HTML);
        // no break — render() exits

    case '/login':
    case '/callback':
        // A single authenticate() gate works for both legs: jumbojett detects
        // the ?code=... on the callback redirect and completes the exchange.
        $oidc = namoid_client();
        $oidc->authenticate();

        $_SESSION['claims'] = (array) $oidc->getVerifiedClaims();
        // userinfo gives email even when it isn't in the id_token.
        $_SESSION['claims']['email'] = $oidc->requestUserInfo('email');
        $_SESSION['id_token_payload'] = (array) $oidc->getIdTokenPayload();

        redirect('/profile');
        // no break — redirect() exits

    case '/profile':
        if (!isset($_SESSION['claims'])) {
            redirect('/login');
        }
        $dump = htmlspecialchars(
            json_encode(
                ['verified_claims' => $_SESSION['claims'], 'id_token' => $_SESSION['id_token_payload'] ?? []],
                JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
            ) ?: '{}',
            ENT_QUOTES
        );
        render('Profile — NamoID quickstart', <<<HTML
<h1>Your profile</h1>
<pre>{$dump}</pre>
<p><a href="/">Home</a> &nbsp; <a href="/logout">Sign out</a></p>
HTML);
        // no break — render() exits

    case '/logout':
        $_SESSION = [];
        session_destroy();
        redirect('/');
        // no break — redirect() exits

    default:
        http_response_code(404);
        render('Not found', '<h1>404</h1><p><a href="/">Home</a></p>');
}
