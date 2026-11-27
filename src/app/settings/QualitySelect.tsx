import { QUALITY_SETTINGS, type QualitySetting, type QualityTier } from "../../core/quality";

// VN-PRF-003, VN-UI-003: the quality setting: auto (from the device, naming the tier it chose) or a tier.

const NAMES: Record<QualityTier, string> = { low: "Low", medium: "Medium", high: "High" };

export function QualitySelect({
  value,
  autoTier,
  onChange,
}: {
  value: QualitySetting;
  /** The device's tier, which auto uses. */
  autoTier: QualityTier;
  onChange(value: QualitySetting): void;
}) {
  return (
    <label>
      Quality{" "}
      <select aria-label="Quality" value={value} onChange={(e) => onChange(e.target.value as QualitySetting)}>
        {QUALITY_SETTINGS.map((q) => (
          <option key={q} value={q}>
            {q === "auto" ? `Auto (${NAMES[autoTier]})` : NAMES[q]}
          </option>
        ))}
      </select>
    </label>
  );
}
