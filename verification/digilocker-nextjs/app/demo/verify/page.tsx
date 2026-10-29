import { notFound, redirect } from "next/navigation";
import { demoMode } from "../../../lib/config";
import { readSession } from "../../../lib/session";
export const dynamic = "force-dynamic";
export default async function DemoConsent({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  if (!demoMode()) notFound();
  const session = await readSession();
  const { id } = await searchParams;
  if (!session || !id || session.pending?.id !== id || session.pending.returned)
    redirect("/");
  return (
    <main className="consent-shell">
      <div className="card consent-card">
        <span className="eyebrow">LOCAL SIMULATION</span>
        <h1>
          Share licence details
          <br />
          with Wayfarer
        </h1>
        <p>
          This screen simulates the hosted document-sharing step. It does not
          connect to DigiLocker.
        </p>
        <div className="document">
          <span className="document-icon">↗</span>
          <div>
            <strong>Synthetic driving licence</strong>
            <p>Aarav Example · ••••4821</p>
          </div>
          <span className="pill">Sample</span>
        </div>
        <p>
          Wayfarer requests your name, masked licence number, issuer, dates, and
          document checks to review a car-rental request. No raw document is
          retained.
        </p>
        <form method="post" action="/api/demo/finish">
          <input type="hidden" name="csrf" value={session.csrf} />
          <input type="hidden" name="verification_id" value={id} />
          <input type="hidden" name="decision" value="share" />
          <label className="consent">
            <input type="checkbox" name="consent" value="yes" required /> I
            agree to share these sample details for this rental review.
          </label>
          <button className="button primary">Simulate sharing licence →</button>
        </form>
        <form method="post" action="/api/demo/finish">
          <input type="hidden" name="csrf" value={session.csrf} />
          <input type="hidden" name="verification_id" value={id} />
          <input type="hidden" name="decision" value="decline" />
          <button className="button quiet">Decline and return</button>
        </form>
        <small>
          Sample data disappears after 15 minutes or when you delete it.
        </small>
      </div>
    </main>
  );
}
