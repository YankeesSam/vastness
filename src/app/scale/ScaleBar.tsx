import { useEffect, useRef } from "react";
import { indicator } from "../../core/scale/indicator";
import { viewReadout, type ViewReadout } from "./readout";
import styles from "./ScaleBar.module.css";

// VN-SCL-004: the logarithmic scale indicator under the view: a bar from 1 m to 10^12 km with marks for reference
// distances and a pointer at the width of the view, which is written out in km, AU and light-time. It follows the
// scene's readout once per animation frame, touching the DOM only when the text changes.

const pct = (p: number) => `${(100 * p).toFixed(2)}%`;

function text(r: ViewReadout): string {
  const ind = indicator(r.widthKm, r.voyager1Km);
  return `${ind.km} · ${ind.au} · ${ind.light}`;
}

export function ScaleBar({
  className,
  readout = viewReadout,
}: {
  className?: string | undefined;
  readout?: ViewReadout;
}) {
  const width = useRef<HTMLSpanElement>(null);
  const pointer = useRef<HTMLSpanElement>(null);
  const voyager = useRef<HTMLSpanElement>(null);
  const first = indicator(readout.widthKm, readout.voyager1Km);

  useEffect(() => {
    let raf = 0;
    let last = "";
    let lastV = "";
    const step = () => {
      const ind = indicator(readout.widthKm, readout.voyager1Km);
      const s = `${ind.km} · ${ind.au} · ${ind.light}`;
      if (s !== last && width.current && pointer.current) {
        last = s;
        width.current.textContent = s;
        pointer.current.style.left = pct(ind.position);
      }
      const v = ind.marks[3];
      const vs = v ? pct(v.position) : "";
      if (vs !== lastV && voyager.current) {
        lastV = vs;
        voyager.current.hidden = !v;
        if (v) voyager.current.style.left = vs;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [readout]);

  return (
    <figure className={`${styles.scale} ${className ?? ""}`} aria-label="Scale">
      <figcaption>
        View width <span ref={width}>{text(readout)}</span>
      </figcaption>
      <div className={styles.bar}>
        {/* names alternate above and below the bar so neighbours do not collide */}
        {first.marks.slice(0, 3).map((m, i) => (
          <span key={m.name} className={styles.mark} style={{ left: pct(m.position) }} title={m.name}>
            <span className={`${styles.markName} ${i % 2 ? styles.below : ""}`}>{m.name}</span>
          </span>
        ))}
        <span
          ref={voyager}
          className={styles.mark}
          style={{ left: pct(first.marks[3]?.position ?? 0) }}
          hidden={first.marks.length < 4}
          title="Voyager 1"
        >
          <span className={`${styles.markName} ${styles.below}`}>Voyager 1</span>
        </span>
        <span ref={pointer} className={styles.pointer} style={{ left: pct(first.position) }} aria-hidden="true" />
      </div>
    </figure>
  );
}
