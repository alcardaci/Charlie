/** A screen-space dot grid, clipped to whichever SVG shape uses it as a fill. */
export function ChartDotPattern({ id, ink, surface }: { id: string; ink: string; surface?: string }) {
  return (
    <pattern id={id} width={4} height={4} patternUnits="userSpaceOnUse">
      {surface && <rect width={4} height={4} fill={surface} />}
      <circle cx={2} cy={2} r={0.95} fill={ink} />
    </pattern>
  );
}
