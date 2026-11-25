import { NewsWorkspace } from './NewsWorkspace';
import { lazy, Suspense } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { PanelBoundary } from './PanelBoundary';

const OverviewPanel = lazy(() => import('../panels/OverviewPanel').then(m => ({ default: m.OverviewPanel })));
const EquityPanel = lazy(() => import('../panels/EquityPanel').then(m => ({ default: m.EquityPanel })));
const ChartPanel = lazy(() => import('../panels/ChartPanel').then(m => ({ default: m.ChartPanel })));

const PredictionPanel = lazy(() => import('../panels/PredictionPanel').then(m => ({ default: m.PredictionPanel })));
const MacroPanel = lazy(() => import('../panels/MacroPanel').then(m => ({ default: m.MacroPanel })));
const PortfolioPanel = lazy(() => import('../panels/PortfolioPanel').then(m => ({ default: m.PortfolioPanel })));
const HeatmapPanel = lazy(() => import('../panels/HeatmapPanel').then(m => ({ default: m.HeatmapPanel })));
const ForexPanel = lazy(() => import('../panels/ForexPanel').then(m => ({ default: m.ForexPanel })));
const CryptoPanel = lazy(() => import('../panels/CryptoPanel').then(m => ({ default: m.CryptoPanel })));
const HelpPanel = lazy(() => import('../panels/HelpPanel').then(m => ({ default: m.HelpPanel })));
const ETFPanel = lazy(() => import('../panels/ETFPanel').then(m => ({ default: m.ETFPanel })));
const SettingsPanel = lazy(() => import('../panels/SettingsPanel').then(m => ({ default: m.SettingsPanel })));
const MultiAssetPanel = lazy(() => import('../panels/MultiAssetPanel').then(m => ({ default: m.MultiAssetPanel })));

export function MainPanel() {
  const { activePanel } = useTerminalStore();

  const news = activePanel === 'news' || activePanel === 'geopolitics';
  const panels: Record<string, JSX.Element> = {
    overview: <OverviewPanel />,
    equity: <EquityPanel />,
    chart: <ChartPanel />,
    multiAsset: <MultiAssetPanel />,
    predictions: <PredictionPanel />,
    macro: <MacroPanel />,
    portfolio: <PortfolioPanel />,
    heatmap: <HeatmapPanel />,
    forex: <ForexPanel />,
    crypto: <CryptoPanel />,
    // Keep legacy `yield` routes pointed at the merged Macro panel.
    yield: <MacroPanel />,
    etf: <ETFPanel />,
    help: <HelpPanel />,
    settings: <SettingsPanel />,
  };

  return (
    <div className="instrument-workspace flex h-full min-h-0 flex-col overflow-hidden bg-terminal-bg">
      {!news && <PanelBoundary key={activePanel}>
        <Suspense fallback={<div role="status" className="p-4 text-sm text-terminal-muted">Opening workspace…</div>}>
          {panels[activePanel] ?? <OverviewPanel />}
        </Suspense>
      </PanelBoundary>}
      <NewsWorkspace active={news} />
    </div>
  );
}
