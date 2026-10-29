import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const app = fileURLToPath(new URL("../", import.meta.url));
const sdk = resolve(process.argv[2] || resolve(app, "../../../namoid-js"));
const destination = resolve(app, ".sdk");
await mkdir(destination, { recursive: true });
function run(args, cwd) {
  const result = spawnSync("pnpm", args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const [pkg, version] of [
  ["js", "3.3.0"],
  ["nextjs", "4.2.0"],
]) {
  const manifest = JSON.parse(
    await readFile(resolve(sdk, `packages/${pkg}/package.json`), "utf8"),
  );
  if (manifest.version !== version)
    throw new Error(
      `Expected ${pkg}@${version}; use the DigiLocker SDK branch.`,
    );
}
run(["--filter", "@namoidhq/js", "build"], sdk);
run(["--filter", "@namoidhq/nextjs", "build"], sdk);
for (const pkg of ["js", "nextjs"])
  run(
    ["pack", "--pack-destination", destination],
    resolve(sdk, "packages", pkg),
  );
console.log("Local preview SDKs prepared. Run pnpm install, then pnpm dev.");
