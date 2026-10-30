import { randomUUID } from "node:crypto";
import {
  createNamoIDVerificationClient,
  type NamoIDVerification,
} from "@namoidhq/js/server";
import { memory, prune, type AppSession } from "./store";
// This transport simulates the NamoID verification API, NOT the DigiLocker protocol.
// The application still uses the actual SDK create/get/cancel/delete methods.
export function demoClient(session: AppSession, origin: string) {
  return createNamoIDVerificationClient({
    clientId: "synthetic-app",
    clientSecret: "synthetic-only",
    apiBaseUrl: origin,
    fetcher: async (input, init) => {
      prune();
      const url = new URL(String(input));
      if (init?.method === "POST" && url.pathname === "/v1/verifications") {
        const body = JSON.parse(String(init.body));
        if (
          body.user_access_token !== session.accessToken ||
          body.return_uri !== origin + "/api/verification/return"
        )
          return Response.json({}, { status: 403 });
        const previous = [...memory.demo.values()].find(
          (r) => r.owner === session.id && r.state === body.state,
        );
        if (previous) return Response.json(previous.value);
        if (memory.demo.size >= 2000) return Response.json({}, { status: 429 });
        const id = randomUUID();
        const value: NamoIDVerification = {
          id,
          status: "pending",
          check_type: "driving_licence",
          expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
          result_expires_at: null,
          hosted_url: origin + "/demo/verify?id=" + id,
          error_code: null,
          result: null,
        };
        memory.demo.set(id, {
          owner: session.id,
          state: body.state,
          returnUri: body.return_uri,
          value,
        });
        return Response.json(value, { status: 201 });
      }
      const match = url.pathname.match(
        /^\/v1\/verifications\/([0-9a-f-]+)(?:\/(cancel|result))?$/,
      );
      const record = match ? memory.demo.get(match[1]) : undefined;
      if (!record || record.owner !== session.id)
        return Response.json({}, { status: 404 });
      if (
        init?.method === "POST" &&
        match?.[2] === "cancel" &&
        record.value.status === "pending"
      )
        record.value.status = "cancelled";
      if (init?.method === "DELETE" && match?.[2] === "result") {
        record.value.result = null;
        record.value.result_expires_at = null;
        return new Response(null, { status: 204 });
      }
      return Response.json(record.value);
    },
  });
}
export function finishDemo(
  session: AppSession,
  id: string,
  decision: string,
): string | null {
  prune();
  const record = memory.demo.get(id);
  if (
    !record ||
    record.owner !== session.id ||
    session.pending?.id !== id ||
    record.value.status !== "pending"
  )
    return null;
  record.value.hosted_url = null;
  record.value.status = decision === "share" ? "completed" : "declined";
  if (decision === "share") {
    record.value.result_expires_at = record.value.expires_at;
    record.value.result = {
      provider: "digilocker",
      document_type: "driving_licence",
      issuer: "Synthetic transport authority",
      holder_name: "Aarav Example",
      licence_number_masked: "••••4821",
      issued_on: "2020-01-15",
      checked_at: new Date().toISOString(),
      validity_periods: [
        {
          kind: "document",
          valid_from: "2020-01-15",
          expires_on: "2035-01-14",
        },
      ],
      checks: {
        source: "passed",
        integrity: "passed",
        issuer_signature: "not_present",
        expiry: "valid",
      },
    };
  }
  const target = new URL(record.returnUri);
  target.searchParams.set("verification_id", id);
  target.searchParams.set("state", record.state);
  return target.toString();
}
