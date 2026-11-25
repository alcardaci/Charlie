import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { PanelBoundary } from '../components/PanelBoundary';
import { ChartPanel } from './ChartPanel';
import { EquityPanel } from './EquityPanel';
import { useTerminalStore, type MultiAssetTile, type MultiAssetView } from '../store/useTerminalStore';

const MAX_MULTI_ASSET_TILES = 4;

function normalizeSymbolInput(value: string): string {
  return value.trim().toUpperCase();
}

function tileGridClass(tileCount: number): string {
  if (tileCount <= 1) return 'grid-cols-1';
  return 'grid-cols-1 lg:grid-cols-2';
}

export function MultiAssetPanel() {
  const {
    activeSymbol,
    multiAssetTiles,
    addMultiAssetTile,
    removeMultiAssetTile,
    setMultiAssetTileView,
  } = useTerminalStore();
  const [draftSymbol, setDraftSymbol] = useState('');
  const canAddMore = multiAssetTiles.length < MAX_MULTI_ASSET_TILES;

  const handleAddSymbol = (value = draftSymbol) => {
    const symbol = normalizeSymbolInput(value);
    if (!symbol || !canAddMore) return;
    addMultiAssetTile(symbol, 'research');
    setDraftSymbol('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-terminal-bg">
      <div className="flex flex-col gap-3 border-b border-terminal-border bg-terminal-panel px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-terminal-accent text-sm font-bold tracking-wider">MULTI-ASSET WORKSPACE</div>
          <div className="mt-1 text-[11px] text-terminal-faint">
            View up to four assets in parallel. Each tile can switch between Research and Chart.
          </div>
        </div>

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            handleAddSymbol();
          }}
        >
          <input
            value={draftSymbol}
            onChange={(event) => setDraftSymbol(event.target.value)}
            disabled={!canAddMore}
            placeholder={canAddMore ? `Add symbol, e.g. ${activeSymbol}` : 'Four assets selected'}
            className="w-44 rounded border border-terminal-border bg-terminal-elevated px-3 py-1.5 text-xs text-terminal-text placeholder-terminal-faint outline-none transition-colors focus:border-terminal-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
            spellCheck={false}
            autoCapitalize="characters"
          />
          <button
            type="submit"
            disabled={!canAddMore || !draftSymbol.trim()}
            className="inline-flex items-center gap-1.5 rounded border border-terminal-accent/40 bg-terminal-accent/10 px-3 py-1.5 text-xs text-terminal-accent transition-colors hover:bg-terminal-accent/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus size={12} />
            ADD ASSET
          </button>
          <span className="text-[11px] text-terminal-faint">
            {multiAssetTiles.length}/{MAX_MULTI_ASSET_TILES}
          </span>
        </form>
      </div>

      {multiAssetTiles.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md rounded border border-terminal-border bg-terminal-panel p-5 text-center">
            <div className="text-terminal-accent text-xs font-bold tracking-[0.18em]">NO ASSETS SELECTED</div>
            <div className="mt-2 text-sm text-terminal-muted">
              Add a symbol above to start a parallel Research/Chart workspace.
            </div>
          </div>
        </div>
      ) : (
        <div className={`grid flex-1 min-h-0 gap-3 p-3 ${tileGridClass(multiAssetTiles.length)} auto-rows-fr`}>
          {multiAssetTiles.map((tile) => (
            <MultiAssetTileCard
              key={tile.id}
              tile={tile}
              canRemove={multiAssetTiles.length > 1}
              onRemove={() => removeMultiAssetTile(tile.id)}
              onViewChange={(view) => setMultiAssetTileView(tile.id, view)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MultiAssetTileCard({
  tile,
  canRemove,
  onRemove,
  onViewChange,
}: {
  tile: MultiAssetTile;
  canRemove: boolean;
  onRemove: () => void;
  onViewChange: (view: MultiAssetView) => void;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded border border-terminal-border bg-terminal-bg">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-terminal-border bg-terminal-panel px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-terminal-accent text-sm font-bold tracking-wider">{tile.symbol}</span>
          <span className="text-[10px] text-terminal-faint">PARALLEL TILE</span>
        </div>

        <div className="flex items-center gap-1">
          {canRemove ? (
            <button
              onClick={onRemove}
              className="rounded border border-terminal-border p-1 text-terminal-faint transition-colors hover:border-terminal-negative/40 hover:bg-terminal-hover hover:text-terminal-negative"
              title={`Remove ${tile.symbol}`}
              aria-label={`Remove ${tile.symbol}`}
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <PanelBoundary key={`${tile.symbol}-${tile.view}`}>
        {tile.view === 'chart' ? (
          <ChartPanel symbol={tile.symbol} embedded onSwitchView={onViewChange} />
        ) : (
          <EquityPanel symbol={tile.symbol} embedded onSwitchView={onViewChange} />
        )}
        </PanelBoundary>
      </div>
    </section>
  );
}
