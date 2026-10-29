import assert from "node:assert/strict";
import test from "node:test";
import {
  createSession,
  findSession,
  memory,
  randomSecret,
  sameSecret,
  validReturn,
  validateTrip,
  todayIndia,
} from "../lib/store.ts";

test("opaque sessions keep upstream tokens out of their identifier and expire", () => {
  const session = createSession({
    userId: "renter",
    accessToken: "private-upstream-token",
  });
  assert.notEqual(session.id, session.accessToken);
  assert.match(session.id, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(findSession(session.id), session);
  session.expiresAt = Date.now() - 1;
  assert.equal(findSession(session.id), null);
});

test("session lifetime is bounded and unknown cookies do not create identities", () => {
  const before = Date.now();
  const session = createSession(
    { userId: "renter", accessToken: "secret" },
    9999999,
  );
  assert.ok(session.expiresAt <= before + 1800005);
  assert.equal(findSession("untrusted-cookie"), null);
  assert.equal(findSession(undefined), null);
});

test("verification returns bind state and ID to one session and reject replay", () => {
  const session = createSession({ userId: "renter", accessToken: "secret" });
  const state = randomSecret();
  session.pending = {
    id: "bound-verification",
    state,
    key: randomSecret(),
    returned: false,
  };
  assert.equal(validReturn(session, "bound-verification", state), true);
  assert.equal(validReturn(session, "other-verification", state), false);
  assert.equal(
    validReturn(session, "bound-verification", "wrong-state"),
    false,
  );
  const other = createSession({
    userId: "other-renter",
    accessToken: "other-token",
  });
  assert.equal(validReturn(other, "bound-verification", state), false);
  session.pending.returned = true;
  assert.equal(validReturn(session, "bound-verification", state), false);
});

test("constant-time comparison handles empty and unequal lengths", () => {
  assert.equal(sameSecret("abc", "abc"), true);
  assert.equal(sameSecret("abc", "ab"), false);
  assert.equal(sameSecret("abc", "xyz"), false);
});

test("trip validation requires known cars and real, ordered, bounded dates", () => {
  const today = todayIndia();
  const date = (days: number) =>
    new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
  const data = new FormData();
  data.set("car", "trail");
  data.set("pickup", date(1));
  data.set("dropoff", date(4));
  assert.deepEqual(validateTrip(data), {
    car: "trail",
    pickup: date(1),
    dropoff: date(4),
  });
  data.set("car", "anything");
  assert.equal(validateTrip(data), null);
  data.set("car", "city");
  data.set("dropoff", date(1));
  assert.equal(validateTrip(data), null);
  data.set("dropoff", date(40));
  assert.equal(validateTrip(data), null);
  data.set("pickup", "2030-02-31");
  assert.equal(validateTrip(data), null);
  data.set("pickup", date(-1));
  data.set("dropoff", date(4));
  assert.equal(validateTrip(data), null);
});

test.after(() => {
  memory.sessions.clear();
  memory.demo.clear();
});
