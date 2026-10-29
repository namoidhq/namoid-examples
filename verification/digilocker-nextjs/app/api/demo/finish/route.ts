import { demoMode } from "../../../../lib/config";
import { finishDemo } from "../../../../lib/demo";
import { authorizedForm, rejected } from "../../../../lib/session";
export async function POST(request: Request) {
  if (!demoMode()) return new Response("Not found", { status: 404 });
  const auth = await authorizedForm(request);
  if (!auth) return rejected();
  const id = String(auth.data.get("verification_id") || "");
  const decision = String(auth.data.get("decision") || "");
  if (!["share", "decline"].includes(decision)) return rejected();
  if (decision === "share" && auth.data.get("consent") !== "yes")
    return rejected();
  const target = finishDemo(auth.session, id, decision);
  return target
    ? new Response(null, {
        status: 303,
        headers: { location: target, "Cache-Control": "no-store" },
      })
    : rejected();
}
