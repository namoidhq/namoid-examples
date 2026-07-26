import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NamoIDProvider } from "@namoidhq/react";
import App from "./App";
import "./styles.css";

const clientId = import.meta.env.VITE_NAMOID_CLIENT_ID;

if (!clientId) {
  throw new Error("VITE_NAMOID_CLIENT_ID is required");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NamoIDProvider clientId={clientId}>
      <App />
    </NamoIDProvider>
  </StrictMode>,
);
