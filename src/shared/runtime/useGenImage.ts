import { useCallback, useRef, useState } from 'react';
import { getGameUuid } from './game-id';
import { createMediaRequestId, generateImageMedia, MediaServiceError } from './media';

export interface GenImageOptions {
  /** Required. Prompt text. */
  prompt: string;
  /** Optional. Public HTTPS URL of a reference image. When set, this is an
   *  img2img call and the output aspect ratio will match the ref's. */
  ref_url?: string;
  requestedSize?: { width: number; height: number };
}

export interface UseGenImage {
  generate: (opts: GenImageOptions) => Promise<string>;
  loading: boolean;
  error: Error | null;
  lastUrl: string | null;
}

export function useGenImage(): UseGenImage {
  const referenceMode = 'edit' as const;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const pendingRequestIds = useRef(new Map<string, string>());

  const generate = useCallback(async (opts: GenImageOptions): Promise<string> => {
    if (!opts.prompt) throw new Error('media image: prompt is required');
    setLoading(true);
    setError(null);
    try {
      const sessionId = getGameUuid();
      if (!sessionId) throw new MediaServiceError('INVALID_REQUEST', 'Permanent game UUID is required', 0, false);
      const key = JSON.stringify(opts);
      const requestId = pendingRequestIds.current.get(key) ?? createMediaRequestId();
      pendingRequestIds.current.set(key, requestId);
      try {
        const task = await generateImageMedia({
          sessionId, requestId, mode: opts.ref_url ? referenceMode : 'text', prompt: opts.prompt,
          referenceUrls: opts.ref_url ? [opts.ref_url] : [],
          size: opts.requestedSize ?? { width: 576, height: 1024 },
        });
        pendingRequestIds.current.delete(key);
        setLastUrl(task.media.url);
        return task.media.url;
      } catch (cause) {
        if (cause instanceof MediaServiceError && cause.code !== 'TIMEOUT') pendingRequestIds.current.delete(key);
        throw cause;
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [referenceMode]);

  return { generate, loading, error, lastUrl };
}
