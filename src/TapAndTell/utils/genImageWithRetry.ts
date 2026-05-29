// Wrap shared useGenImage.generate() with auto-retry on HTTP 429 rate limits.
// The platform proxy enforces a per-IP cool-down on genl_image. As of
// 2026-05-29 the effective gap is ~20s (colleague set 15s; observed slightly
// higher with jitter). Two img2img calls back-to-back inside `makeYours`
// (photoreal-prep followed by scene gen) can still trip this on fast paths
// or when another user on the same IP is generating.
//
// Retries up to N times with 25s backoff (covers the ~20s window + jitter).
// Fires onRetry so the orchestrator can surface "the cloud is busy, hold on…"
// in the loader.

import type { UseGenImage, GenImageOptions } from '@shared/runtime';

export interface RetryProgress {
  attempt: number;       // 1-indexed
  maxAttempts: number;
  retrying: boolean;     // true while in backoff sleep
  secondsLeft?: number;  // countdown during backoff
}

export async function genImageWithRetry(
  genImg: UseGenImage,
  opts: GenImageOptions,
  onProgress?: (info: RetryProgress) => void,
  maxAttempts = 4,
  backoffMs = 25_000,
): Promise<string> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onProgress?.({ attempt, maxAttempts, retrying: false });
    try {
      return await genImg.generate(opts);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const isRateLimit = /HTTP 429|429|rate limit/i.test(lastError.message);
      if (!isRateLimit || attempt >= maxAttempts) break;
      // Backoff sleep, ticking each second so UI can show countdown
      const totalSec = Math.floor(backoffMs / 1000);
      for (let s = totalSec; s > 0; s--) {
        onProgress?.({ attempt: attempt + 1, maxAttempts, retrying: true, secondsLeft: s });
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  throw lastError ?? new Error('gen-image failed');
}
