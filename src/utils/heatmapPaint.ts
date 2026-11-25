/** Sector ETFs and individual stocks use the same return scale, saturating at ±3%. */
export function getHeatPaint(change: number | null) {
  const tone = change == null || change === 0 ? 'muted' : change > 0 ? 'positive' : 'negative';
  const ink = `var(--terminal-${tone})`;
  const intensity = Math.min(Math.abs(change ?? 0) / 3, 1);
  const surface = `color-mix(in srgb, var(--heat-tile-${tone}) ${60 + 40 * intensity}%, var(--terminal-bg))`;
  const dotOpacity = change == null ? 0 : 0.1 + 0.05 * intensity;
  const changeText = `color-mix(in srgb, ${ink} 65%, var(--heat-tile-contrast))`;
  return { tone, ink, surface, dotOpacity, changeText };
}

/** HTML counterpart of the SVG ChartDotPattern used by the treemap. */
export function heatDotBackground({ ink, dotOpacity }: ReturnType<typeof getHeatPaint>) {
  if (!dotOpacity) return 'none';
  const dot = `color-mix(in srgb, ${ink} ${dotOpacity * 100}%, transparent)`;
  return `radial-gradient(circle at 2px 2px, ${dot} 0.95px, transparent 1.15px)`;
}
