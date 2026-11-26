import { createContext, useContext } from 'react';

type CompanionPrompt = {
  sendPrompt: (content: string) => boolean;
  isSending: boolean;
  model: string;
  setModel: (model: string) => void;
  forceWebSearch: boolean;
  setForceWebSearch: (required: boolean) => void;
};

export const CompanionPromptContext = createContext<CompanionPrompt | null>(null);

export function useCompanionPrompt(): CompanionPrompt {
  const companion = useContext(CompanionPromptContext);
  if (!companion) throw new Error('The Companion prompt must be inside PanelCompanion.');
  return companion;
}
