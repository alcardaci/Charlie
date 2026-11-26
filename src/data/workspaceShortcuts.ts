export const workspaceShortcuts = ([
  { panel: 'overview',    command: 'HOME',     label: 'OVERVIEW', mobileLabel: 'Home',        name: 'Market Overview' },
  { panel: 'news',        command: 'NEWS',     label: 'NEWS',     mobileLabel: 'News+Geo',    name: 'News + Geopolitics' },
  { panel: 'portfolio',   command: 'PORT',     label: 'PORT',     mobileLabel: 'Port',        name: 'Portfolio' },
  { panel: 'equity',      command: 'RESEARCH', label: 'EQUITY',   mobileLabel: 'Equity',      name: 'Equity Research' },
  { panel: 'heatmap',     command: 'HEAT',     label: 'HEAT',     mobileLabel: 'Heatmap',    name: 'Heatmap' },
  { panel: 'macro',       command: 'MACRO',    label: 'MACRO',    mobileLabel: 'Macro+Yield', name: 'Macro + Yield Monitor' },
  { panel: 'forex',       command: 'FX',       label: 'FX',       mobileLabel: 'Forex',       name: 'Forex' },
  { panel: 'etf',         command: 'ETF',      label: 'ETF',      mobileLabel: 'ETF',         name: 'ETF Monitor' },
  { panel: 'crypto',      command: 'CRYPTO',   label: 'CRYPTO',   mobileLabel: 'Crypto',      name: 'Crypto' },
  { panel: 'predictions', command: 'PRED',     label: 'PRED',     mobileLabel: 'Predictions', name: 'Prediction Markets' },
  { panel: 'congress',    command: 'CONGRESS', label: 'CONGRESS', mobileLabel: 'Congress',    name: 'Congressional Trades' },
  { panel: 'settings',    command: 'SETTINGS', label: 'SETTINGS', mobileLabel: 'Settings',    name: 'Settings' },
] as const).map((workspace, index) => ({ ...workspace, key: `F${index + 1}` }));
