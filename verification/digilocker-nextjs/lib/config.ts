export function appUrl(): string {
  const url = new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3010",
  );
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !(url.protocol === "https:" || (url.protocol === "http:" && loopback))
  ) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be an HTTPS origin or HTTP loopback origin",
    );
  }
  return url.origin;
}
export function demoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}
export function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required in real mode`);
  return value;
}
