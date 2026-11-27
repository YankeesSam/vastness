import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { preloadEphemeris } from "./app/assets/loader";
import { viewStore } from "./app/store/view";
import { applyTestParams, testParams } from "./app/testparams";

// F5: a reference view fixes the time (and camera, layers) before anything loads.
applyTestParams(testParams, viewStore);

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
