import { useTerminalStore } from '../store/useTerminalStore';
import { hydrateLocalStateCache } from './localStateStorage';

/** The store module exists before the asynchronous disk cache has been loaded. */
export async function hydrateTerminalState(): Promise<void> {
  await hydrateLocalStateCache();
  await useTerminalStore.persist.rehydrate();
}
