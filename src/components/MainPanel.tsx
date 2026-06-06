import { useTerminalStore } from '../store/useTerminalStore';
import { OverviewPanel } from '../panels/OverviewPanel';
import { OpportunitiesPanel } from '../panels/OpportunitiesPanel';
import { EquityPanel } from '../panels/EquityPanel';
import { ChartPanel } from '../panels/ChartPanel';
import { NewsGeopoliticsPanel } from '../panels/GeopoliticsPanel';
import { PredictionPanel } from '../panels/PredictionPanel';
import { MacroPanel } from '../panels/MacroPanel';
import { PortfolioPanel } from '../panels/PortfolioPanel';
import { HeatmapPanel } from '../panels/HeatmapPanel';
import { ForexPanel } from '../panels/ForexPanel';
import { CryptoPanel } from '../panels/CryptoPanel';
import { HelpPanel } from '../panels/HelpPanel';
import { ETFPanel } from '../panels/ETFPanel';
import { SettingsPanel } from '../panels/SettingsPanel';
import { MultiAssetPanel } from '../panels/MultiAssetPanel';

export function MainPanel() {
  const { activePanel } = useTerminalStore();

  const panels: Record<string, JSX.Element> = {
    overview: <OverviewPanel />,
    opportunities: <OpportunitiesPanel />,
    equity: <EquityPanel />,
    chart: <ChartPanel />,
    multiAsset: <MultiAssetPanel />,
    news: <NewsGeopoliticsPanel />,
    geopolitics: <NewsGeopoliticsPanel />,
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
    <div className="h-full overflow-hidden bg-terminal-bg">
      {panels[activePanel] ?? <OverviewPanel />}
    </div>
  );
}
