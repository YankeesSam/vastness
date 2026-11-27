import { useEffect, useState } from "react";
import { useView } from "../store/view";
import { renderStats, summarize, type FrameSummary } from "./stats";
import styles from "./StatsOverlay.module.css";

// VN-PRF-001: the `?stats` overlay: frame rate, mean and 95th-percentile frame time over the last ~2 s, the drawing
// buffer's size, the quality tier, and the last frame's renderer counts (VN-PRF-002). Refreshed four times a second.

interface Shown {
  frame: FrameSummary;
  drawCalls: number;
  triangles: number;
  textures: number;
  textureKb: number;
  width: number;
  height: number;
}

function read(): Shown {
  const canvas = document.querySelector("canvas");
  return {
    frame: summarize(renderStats),
    drawCalls: renderStats.drawCalls,
    triangles: renderStats.triangles,
    textures: renderStats.textures,
    textureKb: Math.round(renderStats.textureBytes / 1024),
    width: canvas?.width ?? 0,
    height: canvas?.height ?? 0,
  };
}

export function StatsOverlay() {
  const [shown, setShown] = useState(read);
  const quality = useView((s) => s.quality);
  useEffect(() => {
    const id = setInterval(() => setShown(read()), 250);
    return () => clearInterval(id);
  }, []);
  const f = shown.frame;
  return (
    <dl className={styles.stats} aria-label="Render statistics" data-fps={f.fps.toFixed(1)}>
      <dt>fps</dt>
      <dd>{f.fps.toFixed(1)}</dd>
      <dt>frame</dt>
      <dd>
        {f.meanMs.toFixed(1)} ms, p95 {f.p95Ms.toFixed(1)} ms
      </dd>
      <dt>buffer</dt>
      <dd>
        {shown.width}×{shown.height}
      </dd>
      <dt>quality</dt>
      <dd>{quality}</dd>
      <dt>draws</dt>
      <dd>{shown.drawCalls}</dd>
      <dt>triangles</dt>
      <dd>{shown.triangles.toLocaleString("en-US")}</dd>
      <dt>textures</dt>
      <dd>
        {shown.textures} ({shown.textureKb} KB)
      </dd>
    </dl>
  );
}
