import { cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
await cp(
  resolve(root, ".next/static"),
  resolve(root, ".next/standalone/.next/static"),
  { recursive: true },
);
process.env.PORT ||= "3010";
process.env.HOSTNAME ||= "127.0.0.1";
await import(new URL("../.next/standalone/server.js", import.meta.url));
