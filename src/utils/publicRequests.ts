interface PublicRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  cacheMs?: number;
}

const responses = new Map<string, { expiresAt: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();

/** Bounded public-data reads. Failures are never cached as empty/fresh data. */
export async function fetchPublicJson<T>(url: string, options: PublicRequestOptions = {}): Promise<T> {
  options.signal?.throwIfAborted();
  const cached = responses.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) responses.delete(url);

  const load = async (): Promise<T> => {
    const controller = new AbortController();
    const cancel = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Data source timed out', 'TimeoutError')), options.timeoutMs ?? 12_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Data source unavailable (${response.status})`);
      const value = await response.json() as T;
      if (options.cacheMs && options.cacheMs > 0) {
        if (responses.size >= 200) responses.delete(responses.keys().next().value!);
        responses.set(url, { expiresAt: Date.now() + options.cacheMs, value });
      }
      return value;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
  };

  // A cancellable caller owns its request; cancellation cannot kill another panel's read.
  if (options.signal) return load();
  const existing = pending.get(url);
  if (existing) return existing as Promise<T>;
  const request = load().finally(() => pending.delete(url));
  pending.set(url, request);
  return request;
}
