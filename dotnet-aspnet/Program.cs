using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using System.Security.Claims;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
})
.AddCookie()
.AddOpenIdConnect(options =>
{
    options.Authority = Environment.GetEnvironmentVariable("NAMOID_ISSUER");
    options.ClientId = Environment.GetEnvironmentVariable("NAMOID_CLIENT_ID");
    options.ClientSecret = Environment.GetEnvironmentVariable("NAMOID_CLIENT_SECRET");
    options.ResponseType = "code";
    options.UsePkce = true;
    options.Scope.Clear();
    options.Scope.Add("openid");
    options.Scope.Add("profile");
    options.Scope.Add("email");
    options.SaveTokens = true;
    options.GetClaimsFromUserInfoEndpoint = true;
    options.CallbackPath = "/signin-oidc";
});

builder.Services.AddAuthorization();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", (HttpContext context) =>
{
    var user = context.User;
    if (user.Identity?.IsAuthenticated == true)
    {
        var name = user.FindFirst("name")?.Value
                   ?? user.FindFirst(ClaimTypes.Name)?.Value
                   ?? "there";
        var email = user.FindFirst("email")?.Value
                    ?? user.FindFirst(ClaimTypes.Email)?.Value
                    ?? "(no email)";
        var html = $"""
        <!doctype html>
        <html lang="en">
          <body style="font-family: system-ui; max-width: 32rem; margin: 4rem auto;">
            <h1>NamoID + ASP.NET Core quickstart</h1>
            <p>Signed in as <strong>{name}</strong> ({email}).</p>
            <p><a href="/profile">View profile claims</a></p>
            <p><a href="/logout">Sign out</a></p>
          </body>
        </html>
        """;
        return Results.Content(html, "text/html");
    }

    var anon = """
    <!doctype html>
    <html lang="en">
      <body style="font-family: system-ui; max-width: 32rem; margin: 4rem auto;">
        <h1>NamoID + ASP.NET Core quickstart</h1>
        <p>You are not signed in.</p>
        <p><a href="/login">Sign in with NamoID</a></p>
      </body>
    </html>
    """;
    return Results.Content(anon, "text/html");
});

app.MapGet("/login", () =>
    Results.Challenge(
        new AuthenticationProperties { RedirectUri = "/profile" },
        new[] { OpenIdConnectDefaults.AuthenticationScheme }));

app.MapGet("/profile", (HttpContext context) =>
{
    var user = context.User;
    return Results.Json(new
    {
        sub = user.FindFirst("sub")?.Value
              ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value,
        email = user.FindFirst("email")?.Value
                ?? user.FindFirst(ClaimTypes.Email)?.Value,
        name = user.FindFirst("name")?.Value
               ?? user.FindFirst(ClaimTypes.Name)?.Value,
    });
}).RequireAuthorization();

app.MapGet("/logout", () =>
    Results.SignOut(
        new AuthenticationProperties { RedirectUri = "/" },
        new[]
        {
            CookieAuthenticationDefaults.AuthenticationScheme,
            OpenIdConnectDefaults.AuthenticationScheme,
        }));

app.Run("http://localhost:3009");
