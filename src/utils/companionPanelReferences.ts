import type { PanelType } from '../types';

export type PanelMentionOption = {
  panel: PanelType;
  token: string;
  aliases?: string[];
};

export const PANEL_MENTION_OPTIONS: PanelMentionOption[] = [
  { panel: 'overview', token: 'overview', aliases: ['home', 'market'] },
  { panel: 'equity', token: 'equity' },
  { panel: 'chart', token: 'chart' },
  { panel: 'news', token: 'news', aliases: ['headlines'] },
  { panel: 'macro', token: 'macro', aliases: ['rates', 'economy', 'yield'] },
  { panel: 'geopolitics', token: 'geopolitics', aliases: ['geo'] },
  { panel: 'predictions', token: 'predictions', aliases: ['pred', 'polymarket'] },
  { panel: 'portfolio', token: 'portfolio', aliases: ['holdings', 'positions'] },
  { panel: 'heatmap', token: 'heatmap', aliases: ['sectors'] },
  { panel: 'forex', token: 'forex', aliases: ['fx', 'currencies'] },
  { panel: 'crypto', token: 'crypto', aliases: ['bitcoin'] },
  { panel: 'etf', token: 'etf', aliases: ['funds'] },
];

const PANEL_MENTION_LOOKUP = new Map(
  PANEL_MENTION_OPTIONS.flatMap((option) => [
    [option.token, option.panel] as const,
    ...(option.aliases ?? []).map((alias) => [alias, option.panel] as const),
  ])
);

// A topic such as "predictions for MSFT" is not a request for the Predictions tab.
const panelNames = PANEL_MENTION_OPTIONS.map(({ panel, token, aliases = [] }) => {
  const names = [token, ...aliases];
  if (panel === 'predictions') names.push('prediction markets?');
  return { panel, pattern: new RegExp(`\\b(?:${names.join('|')})\\s+(?:tab|panel|workspace|dashboard)\\b`, 'i') };
});

export function getPanelReferences(question: string, activePanel: PanelType) {
  const mentions = new Set<PanelType>();
  for (const match of question.matchAll(/(?:^|[^\w@])@([a-z0-9-]+)/gi)) {
    const panel = PANEL_MENTION_LOOKUP.get(match[1].toLowerCase());
    if (panel) mentions.add(panel);
  }
  const detailed = new Set(mentions);
  for (const { panel, pattern } of panelNames) {
    if (pattern.test(question)) detailed.add(panel);
  }
  if (/\b(?:my|our)\s+(?:portfolio|holdings|positions|exposure)\b/i.test(question)) detailed.add('portfolio');
  if (/\b(?:my|our)\s+watchlist\b/i.test(question)) detailed.add('overview');
  if (/\b(?:here|on (?:my |the )?screen|looking at|my workspace|the displayed|(?:this|these|that|those) (?:chart|graph|panel|table|view|figure|number|holding|ticker|signal|card|trend|forecast|market)s?)\b/i.test(question)) {
    detailed.add(activePanel);
  }
  return { mentions: [...mentions], detailed: [...detailed], panels: [...new Set([activePanel, ...detailed])] };
}
