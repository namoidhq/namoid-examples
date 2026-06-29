package com.namoid.example;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HomeController {

    @GetMapping(value = "/", produces = MediaType.TEXT_HTML_VALUE)
    public String home(@AuthenticationPrincipal OidcUser user) {
        if (user == null) {
            return """
                <!doctype html>
                <html>
                  <body style="font-family: system-ui; max-width: 32rem; margin: 4rem auto;">
                    <h1>NamoID + Spring Boot quickstart</h1>
                    <p>You are not signed in.</p>
                    <p><a href="/oauth2/authorization/namoid">Sign in with NamoID</a></p>
                  </body>
                </html>
                """;
        }

        String name = user.getFullName() != null ? user.getFullName() : user.getSubject();
        String email = user.getEmail() != null ? user.getEmail() : "(no email)";
        return """
            <!doctype html>
            <html>
              <body style="font-family: system-ui; max-width: 32rem; margin: 4rem auto;">
                <h1>Welcome, %s</h1>
                <p>Email: %s</p>
                <p><a href="/profile">View your profile (JSON)</a></p>
                <form method="post" action="/logout">
                  <button type="submit">Sign out</button>
                </form>
              </body>
            </html>
            """.formatted(name, email);
    }

    @GetMapping("/profile")
    public Map<String, Object> profile(@AuthenticationPrincipal OidcUser user) {
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("sub", user.getSubject());
        claims.put("email", user.getEmail());
        claims.put("name", user.getFullName());
        return claims;
    }
}
