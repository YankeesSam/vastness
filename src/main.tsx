import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// The shell (T-004) replaces this placeholder.
function App() {
  return <h1>Vastness</h1>;
}

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
