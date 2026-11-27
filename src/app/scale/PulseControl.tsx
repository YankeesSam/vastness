import { formatKm, formatLightTime } from "../../core/scale/indicator";
import { pulseRadiusKm } from "../../scene/pulse/pulse";
import { useView, viewStore } from "../store/view";

// VN-SCL-007: starts and stops the light-speed pulse and says how far it has gone.

export function PulseControl() {
  const pulse = useView((s) => s.pulse);
  // whole simulated seconds since the start are enough for the read-out, and re-render less often
  const elapsed = useView((s) => (s.pulse ? Math.floor(s.t - s.pulse.t0) : 0));
  const r = pulse ? pulseRadiusKm({ origin: pulse.origin, t0: 0 }, elapsed) : null;
  const from = pulse?.origin === 399 ? "Earth" : "the Sun";
  return (
    <div>
      <p>
        <button type="button" onClick={() => viewStore.getState().setPulse(10)}>
          From the Sun
        </button>{" "}
        <button type="button" onClick={() => viewStore.getState().setPulse(399)}>
          From Earth
        </button>{" "}
        {pulse && (
          <button type="button" onClick={() => viewStore.getState().setPulse(null)}>
            Stop
          </button>
        )}
      </p>
      <p aria-live="polite">
        {pulse === null
          ? "Send a pulse of light and watch it cross the system at its true speed."
          : r === null
            ? `Time is before the pulse left ${from}.`
            : `Light from ${from}: ${formatKm(r)} out after ${formatLightTime(r).replace(/^(\S+) light-/, "$1 ")}.`}
      </p>
    </div>
  );
}
