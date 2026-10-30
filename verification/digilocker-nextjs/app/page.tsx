import type { NamoIDVerification } from "@namoidhq/js/server";
import { demoMode } from "../lib/config";
import { verifications } from "../lib/namoid";
import { readSession } from "../lib/session";
import { todayIndia } from "../lib/store";
export const dynamic = "force-dynamic";
const notices: Record<string, string> = {
  setup_required:
    "We could not start the licence check. In real mode, confirm that the workspace feature is enabled for Test and the application and credentials are approved. You can retry the same request.",
  invalid_trip:
    "Choose a car and valid pickup and return dates, up to 30 days apart.",
  cancel_first: "Cancel the open licence check before changing your trip.",
  resume_existing:
    "Your check is already open or has ended. Refresh its status, or cancel it before starting another.",
  verification_unavailable:
    "The licence check is temporarily unavailable. Try refreshing the status. Your request has not been approved.",
  login_failed: "Sign-in could not be completed. Please try again.",
  logout_local:
    "You are signed out of this app. Provider sign-out could not be confirmed.",
  deleted: "The retained licence details have been deleted.",
  cancelled: "The open licence check has been cancelled.",
};
function Car({ suv = false }: { suv?: boolean }) {
  return (
    <svg
      className="car-art"
      viewBox="0 0 460 200"
      fill="none"
      aria-hidden="true"
    >
      <ellipse
        cx="230"
        cy="167"
        rx="180"
        ry="13"
        fill="#213e33"
        opacity=".09"
      />
      <path
        d={
          suv
            ? "M54 129L73 85Q77 76 90 74L292 66Q309 67 329 90L363 115L405 127L412 151L44 151Z"
            : "M48 131L78 111L135 72Q148 65 165 65H267Q286 66 310 90L341 113L397 125L410 150H43Z"
        }
        fill={suv ? "#6b8275" : "#d3ba88"}
        stroke="#254c3b"
        strokeWidth="3"
      />
      <path
        d={
          suv
            ? "M94 84L172 81L173 113H80Z M186 80L279 77Q291 79 307 99L319 113H187Z"
            : "M143 78L182 77V111H95Z M195 77H261Q274 79 302 111H195Z"
        }
        fill="#e8f0e9"
        stroke="#365447"
        strokeWidth="2"
      />
      <path
        d="M49 132H401M186 120V148M321 119L329 145"
        stroke="#254c3b"
        strokeWidth="2"
        opacity=".4"
      />
      <rect x="204" y="119" width="21" height="4" rx="2" fill="#254c3b" />
      <path d="M48 136H72M382 134H405" stroke="#fcf5df" strokeWidth="7" />
      {[112, 344].map((x) => (
        <g key={x}>
          <circle cx={x} cy="148" r="31" fill="#243b31" />
          <circle cx={x} cy="148" r="18" fill="#dce2d9" />
          <circle cx={x} cy="148" r="7" fill="#667b6b" />
        </g>
      ))}
    </svg>
  );
}
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const session = await readSession();
  const query = await searchParams;
  let verification: NamoIDVerification | null = null;
  let unavailable = false;
  if (session?.verificationId) {
    try {
      verification = await verifications(session).get(session.verificationId);
    } catch {
      unavailable = true;
    }
  }
  const result = verification?.result;
  const open = Boolean(session?.pending && !session.pending.returned);
  const minimum = todayIndia();
  const tomorrow = new Date(Date.parse(minimum) + 86400000)
    .toISOString()
    .slice(0, 10);
  const later = new Date(Date.parse(minimum) + 4 * 86400000)
    .toISOString()
    .slice(0, 10);
  const trip = session?.trip;
  const days = trip
    ? (Date.parse(trip.dropoff) - Date.parse(trip.pickup)) / 86400000
    : 3;
  const price = trip?.car === "trail" ? 3299 : 1899;
  return (
    <>
      <div className="mode-banner">
        {demoMode()
          ? "DEMO MODE · Synthetic licence details. No NamoID or DigiLocker connection."
          : "CONTROLLED PREVIEW · Available only for approved DigiLocker applications."}
      </div>
      <header className="header wrap">
        <a className="brand" href="/">
          <span className="brand-mark">w.</span>wayfarer
          <span className="brand-dot">®</span>
        </a>
        <div className="header-right">
          <span className="location">Bengaluru, India ↗</span>
          {session ? (
            <form method="post" action="/api/auth/logout">
              <input type="hidden" name="csrf" value={session.csrf} />
              <button className="text-button">Sign out</button>
            </form>
          ) : (
            <span className="pill">A car-rental example</span>
          )}
        </div>
      </header>
      <main className="wrap">
        <section className="hero">
          <div>
            <span className="eyebrow">GOOD CARS. BETTER WEEKENDS.</span>
            <h1>
              Your next chapter.
              <br />
              <em>Take the scenic route.</em>
            </h1>
            <p>
              Find your car, share your licence details, and leave the rest to
              our rental team.
            </p>
          </div>
          <div className="hero-stamp">
            <span>
              THE ROAD
              <br />
              IS CALLING
            </span>
            <strong>↗</strong>
            <small>Make room for a detour.</small>
          </div>
        </section>
        <ol className="steps" aria-label="Rental steps">
          {["Sign in", "Choose your ride", "Share licence details"].map(
            (label, i) => (
              <li
                key={label}
                className={
                  (i === 0 && session) ||
                  (i === 1 && trip) ||
                  (i === 2 && result)
                    ? "done"
                    : ""
                }
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                {label}
              </li>
            ),
          )}
        </ol>
        {query.notice && notices[query.notice] && (
          <p className="notice" role="status">
            {notices[query.notice]}
          </p>
        )}
        <div className="content-grid">
          <section>
            <div className="section-heading">
              <div>
                <span className="eyebrow">START WITH THE JOURNEY</span>
                <h2>Pick your kind of escape.</h2>
              </div>
              <span className="muted">Two great ways to get there</span>
            </div>
            <form method="post" action="/api/verification/start">
              <input type="hidden" name="csrf" value={session?.csrf || ""} />
              <div className="cars">
                {[
                  {
                    id: "city",
                    title: "City hatchback",
                    meta: "5 seats · Manual · Petrol",
                    price: 1899,
                    tag: "THE EVERYDAY ESCAPE",
                  },
                  {
                    id: "trail",
                    title: "Trail SUV",
                    meta: "5 seats · Automatic · Petrol",
                    price: 3299,
                    tag: "A LITTLE MORE ADVENTURE",
                  },
                ].map((car) => (
                  <label className="car-card" key={car.id}>
                    <input
                      type="radio"
                      name="car"
                      value={car.id}
                      defaultChecked={(trip?.car || "city") === car.id}
                      disabled={!session || open}
                    />
                    <span className="car-check" />
                    <span className="car-tag">{car.tag}</span>
                    <Car suv={car.id === "trail"} />
                    <div className="car-bottom">
                      <div>
                        <h3>{car.title}</h3>
                        <p>{car.meta}</p>
                      </div>
                      <div className="car-price">
                        {money(car.price)}
                        <small>/ day</small>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="trip-fields card">
                <div className="pickup-location">
                  <span className="eyebrow">PICKUP LOCATION</span>
                  <strong>Indiranagar, Bengaluru</strong>
                  <small>Example location · Return to the same place</small>
                </div>
                <label>
                  <span>Pickup date</span>
                  <input
                    type="date"
                    name="pickup"
                    min={minimum}
                    defaultValue={trip?.pickup || tomorrow}
                    required
                    disabled={!session || open}
                  />
                </label>
                <label>
                  <span>Return date</span>
                  <input
                    type="date"
                    name="dropoff"
                    min={tomorrow}
                    defaultValue={trip?.dropoff || later}
                    required
                    disabled={!session || open}
                  />
                </label>
              </div>
              {session && !open && (
                <div className="next-action">
                  <p>
                    Next: share only the licence details needed for rental
                    review.
                  </p>
                  <button className="button primary">
                    {result
                      ? "Start a new licence check"
                      : "Continue to licence check"}{" "}
                    <span>↗</span>
                  </button>
                </div>
              )}
            </form>
            {!session && (
              <div className="signin-strip">
                <div>
                  <h3>A small step before the open road.</h3>
                  <p>Sign in to choose your car and start the licence check.</p>
                </div>
                <form method="post" action="/api/auth/login">
                  <button className="button primary">
                    {demoMode()
                      ? "Try as a demo renter"
                      : "Sign in to continue"}{" "}
                    ↗
                  </button>
                </form>
              </div>
            )}
            <div className="assurance">
              <span>↗ No raw document retained</span>
              <span>◉ Your choice to share</span>
              <span>✓ Reviewed by the rental team</span>
            </div>
          </section>
          <aside className="review card">
            <span className="eyebrow">YOUR RENTAL REQUEST</span>
            <h2>
              {result
                ? "Licence details received."
                : open
                  ? "Your licence check is open."
                  : "A smoother start."}
            </h2>
            {!session ? (
              <>
                <p>
                  Once you sign in, we’ll ask you to share an issued driving
                  licence through DigiLocker.
                </p>
                <div className="empty-document">
                  <span>↗</span>
                  <strong>Your licence, your control.</strong>
                  <p>Choose what to share for your rental review.</p>
                </div>
              </>
            ) : (
              <>
                <div className="signed-in">
                  <span className="avatar">{demoMode() ? "A" : "✓"}</span>
                  <div>
                    <strong>
                      {demoMode() ? "Aarav Example" : "Signed-in renter"}
                    </strong>
                    <small>
                      {demoMode()
                        ? "Synthetic demo identity"
                        : "NamoID Hosted Auth"}
                    </small>
                  </div>
                  <span className="pill">Signed in</span>
                </div>
                {trip && (
                  <dl className="trip-summary">
                    <div>
                      <dt>Your car</dt>
                      <dd>
                        {trip.car === "trail" ? "Trail SUV" : "City hatchback"}
                      </dd>
                    </div>
                    <div>
                      <dt>Pickup</dt>
                      <dd>{trip.pickup}</dd>
                    </div>
                    <div>
                      <dt>Return</dt>
                      <dd>{trip.dropoff}</dd>
                    </div>
                    <div className="total">
                      <dt>{days} days · Illustrative estimate</dt>
                      <dd>{money(price * days)}</dd>
                    </div>
                  </dl>
                )}
                {result ? (
                  <div className="licence-result">
                    <span className="pill green">Document received</span>
                    <h3>{result.holder_name || "Licence holder"}</h3>
                    <p className="masked-number">
                      {result.licence_number_masked}
                    </p>
                    <dl className="checks">
                      <div>
                        <dt>Document source</dt>
                        <dd>Checked</dd>
                      </div>
                      <div>
                        <dt>Document integrity</dt>
                        <dd>Checked</dd>
                      </div>
                      <div>
                        <dt>Validity dates</dt>
                        <dd
                          className={
                            result.checks.expiry === "valid"
                              ? "positive"
                              : "attention"
                          }
                        >
                          {result.checks.expiry === "valid"
                            ? "Current"
                            : result.checks.expiry === "expired"
                              ? "Expired · Review needed"
                              : "Unknown · Review needed"}
                        </dd>
                      </div>
                      <div>
                        <dt>Issuer signature</dt>
                        <dd>
                          {result.checks.issuer_signature === "passed"
                            ? "Checked"
                            : "Not present"}
                        </dd>
                      </div>
                    </dl>
                    <p className="result-note">
                      The rental team still needs to review your request.
                      Document checks do not establish live driving eligibility
                      or match your face.
                    </p>
                    <form method="post" action="/api/verification/delete">
                      <input type="hidden" name="csrf" value={session.csrf} />
                      <button className="text-button">
                        Delete shared licence details
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="status-box">
                    <span className="status-dot" />
                    <strong>
                      {unavailable
                        ? "Unable to load status"
                        : verification
                          ? verification.status === "completed"
                            ? "Shared details deleted or expired"
                            : `Licence check: ${verification.status}`
                          : "Licence details not shared yet"}
                    </strong>
                    <p>
                      {open
                        ? "Finish in the browser window where the check started. You can also cancel and try again."
                        : "Your issued driving licence helps the rental team review the document source and available dates."}
                    </p>
                    {session.verificationId && (
                      <a className="button secondary" href="/">
                        Refresh status ↻
                      </a>
                    )}
                    {open && (
                      <form method="post" action="/api/verification/cancel">
                        <input type="hidden" name="csrf" value={session.csrf} />
                        <button className="text-button">
                          Cancel this check
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </>
            )}
            <p className="review-footer">
              This example does not make a reservation, collect payment, or
              approve a rental.
            </p>
          </aside>
        </div>
        <footer className="footer">
          <span>wayfarer · A little further.</span>
          <span>
            Sign-in &amp; document access powered by <strong>NamoID ↗</strong>
          </span>
        </footer>
      </main>
    </>
  );
}
