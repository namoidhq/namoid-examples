import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const cwd = fileURLToPath(new URL("../", import.meta.url));
const port = process.env.TEST_PORT || "3011";
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [resolve(cwd, "scripts/start.mjs")], {
  cwd,
  env: {
    ...process.env,
    DEMO_MODE: "true",
    PORT: port,
    HOSTNAME: "127.0.0.1",
    NEXT_PUBLIC_APP_URL: base,
    NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (chunk) => {
  logs += chunk;
});
child.stderr.on("data", (chunk) => {
  logs += chunk;
});
const jar = new Map();
async function request(
  path,
  { method = "GET", data, cookies = jar, origin = base } = {},
) {
  const response = await fetch(new URL(path, base), {
    method,
    redirect: "manual",
    headers: {
      ...(method === "POST"
        ? { origin, "content-type": "application/x-www-form-urlencoded" }
        : {}),
      cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    },
    ...(data ? { body: new URLSearchParams(data) } : {}),
  });
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(";")[0];
    const index = pair.indexOf("=");
    const name = pair.slice(0, index),
      value = pair.slice(index + 1);
    if (value) cookies.set(name, value);
    else cookies.delete(name);
  }
  return response;
}
function csrf(html) {
  const match = html.match(/name="csrf" value="([^"]+)"/);
  assert.ok(match, "CSRF token missing");
  return match[1];
}
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (child.exitCode !== null) throw new Error("Example server exited");
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  assert.ok(ready, "Example server did not start");
  let response = await request("/");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin");
  const guest = await response.text();
  assert.match(guest, /wayfarer/);
  assert.match(guest, /DEMO MODE/);
  response = await request("/api/auth/login", {
    method: "POST",
    origin: "https://untrusted.example",
  });
  assert.equal(response.status, 403);
  response = await request("/api/auth/login", { method: "POST" });
  assert.equal(response.status, 303);
  assert.ok(response.headers.get("set-cookie").includes("HttpOnly"));
  let html = await (await request("/")).text();
  const token = csrf(html);
  assert.equal(html.includes("access_token"), false);
  const pickup = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const dropoff = new Date(Date.now() + 5 * 86400000)
    .toISOString()
    .slice(0, 10);
  const trip = { csrf: token, car: "trail", pickup, dropoff };
  response = await request("/api/verification/start", {
    method: "POST",
    data: { ...trip, csrf: "wrong" },
  });
  assert.equal(response.status, 403);
  response = await request("/api/verification/start", {
    method: "POST",
    data: trip,
  });
  assert.equal(response.status, 303);
  const launch = response.headers.get("location");
  assert.ok(launch?.includes("/demo/verify?id="));
  const id = new URL(launch).searchParams.get("id");
  html = await (await request(launch)).text();
  assert.match(html, /Synthetic driving licence/);
  response = await request("/api/demo/finish", {
    method: "POST",
    data: {
      csrf: "wrong",
      verification_id: id,
      decision: "share",
      consent: "yes",
    },
  });
  assert.equal(response.status, 403);
  response = await request("/api/demo/finish", {
    method: "POST",
    data: {
      csrf: token,
      verification_id: id,
      decision: "share",
      consent: "yes",
    },
  });
  assert.equal(response.status, 303);
  const callback = response.headers.get("location");
  response = await request(callback, { cookies: new Map() });
  assert.equal(response.status, 400);
  const tampered = new URL(callback);
  tampered.searchParams.set("state", "wrong");
  response = await request(tampered);
  assert.equal(response.status, 400);
  const duplicate = new URL(callback);
  duplicate.searchParams.append("state", "extra");
  response = await request(duplicate);
  assert.equal(response.status, 400);
  response = await request(callback);
  assert.equal(response.status, 303);
  response = await request(callback);
  assert.equal(response.status, 400);
  html = await (await request("/")).text();
  assert.match(html, /Licence details received/);
  assert.match(html, /4821/);
  assert.match(html, /rental team still needs to review/);
  response = await request("/api/verification/delete", {
    method: "POST",
    data: { csrf: token, verification_id: "browser-cannot-pick-another-id" },
  });
  assert.equal(response.status, 303);
  html = await (await request("/")).text();
  assert.equal(html.includes("4821"), false);
  assert.match(html, /deleted or expired/);
  response = await request("/api/verification/start", {
    method: "POST",
    data: trip,
  });
  const second = new URL(response.headers.get("location")).searchParams.get(
    "id",
  );
  assert.notEqual(second, id);
  response = await request("/api/verification/cancel", {
    method: "POST",
    data: { csrf: token },
  });
  assert.equal(response.status, 303);
  html = await (await request("/")).text();
  assert.match(html, /Licence check: cancelled/);
  response = await request("/api/auth/logout", {
    method: "POST",
    data: { csrf: token },
  });
  assert.equal(response.status, 303);
  assert.equal(jar.has("wayfarer_session"), false);
  html = await (await request("/")).text();
  assert.match(html, /Try as a demo renter/);
  console.log(
    "PASS: rental journey, real SDK transport, opaque cookies, CSRF/origin, callback binding/replay, delete, restart, cancel, logout.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  child.kill("SIGTERM");
}
