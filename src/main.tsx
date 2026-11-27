import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { preloadEphemeris } from "./app/assets/loader";
import { viewStore } from "./app/store/view";

// VN-PRF-004: the first ephemeris chunks download while the app starts.
preloadEphemeris(viewStore.getState().t).catch(() => {
  // Reported by the scene, which awaits the same promise.
});

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
