import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NamoIDError, relayHostedAuthPopupCallback } from "@namoidhq/js";
import { NamoIDProvider } from "@namoidhq/react";
import App from "./App";
import "./styles.css";

const clientId = import.meta.env.VITE_NAMOID_CLIENT_ID;

if (!clientId) {
  throw new Error("VITE_NAMOID_CLIENT_ID is required");
}

const callback = new URL(window.location.href);
const isAuthorizationCallback =
  callback.pathname === "/auth/callback" &&
  (callback.searchParams.has("code") || callback.searchParams.has("error"));

let relayedToOpener = false;
if (isAuthorizationCallback) {
  try {
    relayHostedAuthPopupCallback(callback.toString());
    relayedToOpener = true;
  } catch (error) {
    // A blocked popup falls back to a full-page redirect. In that case there
    // is no opener/channel and App completes the stored redirect transaction.
    if (!(error instanceof NamoIDError) || error.code !== "popup_receiver_unavailable") {
      console.error("NamoID popup callback relay failed", error);
    }
  }
}

if (relayedToOpener) {
  document.getElementById("root")!.innerHTML = `
    <main class="callback-shell" aria-live="polite">
      <p class="status success">Sign-in complete</p>
      <h1>You can close this window</h1>
      <p>The secure result has been returned to the application.</p>
    </main>
  `;
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <NamoIDProvider clientId={clientId}>
        <App />
      </NamoIDProvider>
    </StrictMode>,
  );
}
