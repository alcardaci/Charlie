import { createContext, useContext, useId, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildMacroTrendRows, formatMacroNumber, formatMacroReading } from '../utils/macroDisplay';
import { availableMacroWindows, macroBounds, sliceMacroHistory, windowStart } from '../utils/macroHistory';
import type { MacroHistory, MacroWindow } from '../utils/macroHistory';
import type { getThemePalette } from '../utils/theme';

export const MacroRangeContext = createContext<{ range: MacroWindow; revision: number; onOverride?: () => void }>({ range: '1Y', revision: 0 });
const monthYear = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
const year = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'UTC' });

export function MacroRangeSelect({ label, range, options, onChange, mixed = false }: {
  label: string; range: MacroWindow; options: MacroWindow[]; mixed?: boolean; onChange: (range: MacroWindow) => void;
}) {
  return <select aria-label={label} value={mixed ? '' : range} onChange={event => onChange(event.target.value as MacroWindow)}
    className="rounded border border-terminal-border bg-terminal-panel px-1.5 py-0.5 text-[11px] text-terminal-text">
    {mixed && <option value="" disabled>Individual ranges</option>}
    {options.map(option => <option key={option} value={option}>{option === 'All' ? 'All available' : option}</option>)}
  </select>;
}

type SeriesLine = MacroHistory & { id: string; label: string; stroke: string; strokeDasharray?: string };
export function MacroHistoryChart({ title, lines, unit, palette, height = 'h-28', reference }: {
  title: string; lines: SeriesLine[]; unit: string; palette: ReturnType<typeof getThemePalette>;
  height?: string; reference?: number;
}) {
  const gradient = useId().replace(/:/g, '');
  const shared = useContext(MacroRangeContext);
  const [override, setOverride] = useState<{ range: MacroWindow; revision: number } | null>(null);
  const options = availableMacroWindows(lines);
  const preferred = override?.revision === shared.revision ? override.range : shared.range;
  const range = options.includes(preferred) ? preferred : 'All';
  const bounds = macroBounds(lines);
  if (!options.length) return <p className="my-4 text-xs text-terminal-faint">No history available</p>;
  const start = windowStart(range, bounds);
  const end = bounds[1];
  const rows = buildMacroTrendRows(lines.map(line => ({ id: line.id, series: sliceMacroHistory(line, start) })))
    .map(row => ({ ...row, timestamp: Date.parse(String(row.date)) }));
  const single = lines.length === 1;
  const axisDate = end - start < 100 * 86400000 ? shortDate : end - start > 4 * 365 * 86400000 ? year : monthYear;
  return <>
    <div className="my-2 flex flex-wrap items-center justify-between gap-1 text-[10px] text-terminal-faint">
      <span>{fullDate.format(start)}{end !== start && ` – ${fullDate.format(end)}`}</span>
      {options.length > 1 && <MacroRangeSelect label={`${title} time frame`} options={options} range={range}
        onChange={choice => { setOverride({ range: choice, revision: shared.revision }); shared.onOverride?.(); }} />}
    </div>
    <div className={height}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          {single && <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={lines[0].stroke} stopOpacity={0.3} /><stop offset="100%" stopColor={lines[0].stroke} stopOpacity={0} />
          </linearGradient></defs>}
          <CartesianGrid stroke={palette.chartGrid} strokeDasharray="3 3" />
          <XAxis dataKey="timestamp" type="number" scale="utc" domain={[start, end]} ticks={start === end ? [start] : undefined}
            tickCount={4} minTickGap={18} tickFormatter={value => axisDate.format(value)} tick={{ fill: palette.muted, fontSize: 10 }} tickLine={false} axisLine={{ stroke: palette.border }} />
          <YAxis width={unit === 'jobs' ? 82 : 48} domain={['auto', 'auto']} tick={{ fill: palette.muted, fontSize: 10 }}
            tickLine={false} axisLine={{ stroke: palette.border }} tickFormatter={value => formatMacroNumber(value, unit === 'jobs' ? 0 : 2)} />
          <Tooltip contentStyle={{ background: palette.elevated, border: `1px solid ${palette.border}`, borderRadius: 4, fontSize: 11 }}
            labelStyle={{ color: palette.text }} labelFormatter={value => fullDate.format(Number(value))}
            formatter={(value: number, name: string) => [formatMacroReading(value, unit), name]} />
          {!single && <Legend wrapperStyle={{ color: palette.muted, fontSize: 10 }} />}
          {reference !== undefined && <ReferenceLine y={reference} stroke={palette.muted} strokeDasharray="3 3" />}
          {lines.map(line => single
            ? <Area key={line.id} dataKey={line.id} name={line.label} type={line.step ? 'stepAfter' : 'linear'} stroke={line.stroke}
                fill={`url(#${gradient})`} strokeWidth={2} dot={rows.length === 1} isAnimationActive={false} />
            : <Line key={line.id} dataKey={line.id} name={line.label} type="linear" stroke={line.stroke} strokeDasharray={line.strokeDasharray}
                strokeWidth={2} dot={line.series.length === 1} activeDot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />)}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  </>;
}
