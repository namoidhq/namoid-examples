import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NamoIDVerification } from "@namoidhq/js/server";

export const randomSecret = () => randomBytes(32).toString("base64url");
export function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export type Trip = { car: "city" | "trail"; pickup: string; dropoff: string };
export type AppSession = {
  id: string;
  csrf: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
  trip?: Trip;
  pending?: { id?: string; state: string; key: string; returned: boolean };
  verificationId?: string;
};
type DemoRecord = {
  owner: string;
  state: string;
  returnUri: string;
  value: NamoIDVerification;
};
type Memory = {
  sessions: Map<string, AppSession>;
  demo: Map<string, DemoRecord>;
};
const globals = globalThis as typeof globalThis & {
  rentalExampleMemory?: Memory;
};
// Deliberately single-process demo storage. Replace with an encrypted TTL-backed
// Redis/database store before deploying replicas or retaining customer data.
export const memory = (globals.rentalExampleMemory ??= {
  sessions: new Map(),
  demo: new Map(),
});
export function prune(): void {
  const now = Date.now();
  for (const [id, session] of memory.sessions)
    if (session.expiresAt <= now) memory.sessions.delete(id);
  for (const [id, record] of memory.demo) {
    if (
      !memory.sessions.has(record.owner) ||
      Date.parse(record.value.expires_at) <= now
    )
      memory.demo.delete(id);
  }
}
export function createSession(
  input: Pick<
    AppSession,
    "userId" | "accessToken" | "refreshToken" | "idToken"
  >,
  ttlSeconds = 900,
): AppSession {
  prune();
  if (memory.sessions.size >= 1000)
    throw new Error("Example session capacity reached");
  const session: AppSession = {
    ...input,
    id: randomSecret(),
    csrf: randomSecret(),
    expiresAt: Date.now() + Math.min(Math.max(ttlSeconds, 1), 1800) * 1000,
  };
  memory.sessions.set(session.id, session);
  return session;
}
export function findSession(id: string | undefined): AppSession | null {
  prune();
  return id ? (memory.sessions.get(id) ?? null) : null;
}
export function validReturn(
  session: AppSession,
  id: string,
  state: string,
): boolean {
  return Boolean(
    session.pending?.id &&
      !session.pending.returned &&
      sameSecret(session.pending.id, id) &&
      sameSecret(session.pending.state, state),
  );
}
export function todayIndia(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((part) => parts.find((p) => p.type === part)?.value)
    .join("-");
}
export function validateTrip(data: FormData): Trip | null {
  const car = data.get("car");
  const pickup = String(data.get("pickup") || "");
  const dropoff = String(data.get("dropoff") || "");
  if (car !== "city" && car !== "trail") return null;
  const date = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (
    !date(pickup) ||
    !date(dropoff) ||
    pickup < todayIndia() ||
    dropoff <= pickup ||
    Date.parse(dropoff) - Date.parse(pickup) > 30 * 86400000
  )
    return null;
  return { car, pickup, dropoff };
}
