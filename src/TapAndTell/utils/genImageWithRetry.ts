// Wrap shared useGenImage.generate() with auto-retry on HTTP 429 rate limits.
// The platform proxy enforces a per-IP cool-down on genl_image. As of
// 2026-06-01 the effective gap is ~1s (txt2img + img2img both). Per-call
// latency is ~2.5s+, so sequential code (incl. back-to-back makeYours
// photoreal-prep + scene gen) rarely 429s. This retry exists for the case
// where another user on the same IP is generating in the same window.
//
// Retries up to N times with 3s backoff (1s limit + ~2s jitter buffer).
// Fires onRetry so the orchestrator can surface "the cloud is busy, hold on…"
// in the loader.

import type { UseGenImage, GenImageOptions } from '@shared/runtime';
import { MediaServiceError } from '@shared/runtime/media';

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
  backoffMs = 3_000,
): Promise<string> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onProgress?.({ attempt, maxAttempts, retrying: false });
    try {
      return await genImg.generate(opts);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const isRateLimit = (e instanceof MediaServiceError && (e.code === 'RATE_LIMITED' || e.code === 'QUEUE_BUSY')) || /HTTP 429|429|rate limit/i.test(lastError.message);
      if (!isRateLimit || attempt >= maxAttempts) break;
      // Backoff sleep, ticking each second so UI can show countdown
      const totalSec = e instanceof MediaServiceError && e.retryAfterSeconds
        ? Math.max(1, e.retryAfterSeconds)
        : Math.floor(backoffMs / 1000);
      for (let s = totalSec; s > 0; s--) {
        onProgress?.({ attempt: attempt + 1, maxAttempts, retrying: true, secondsLeft: s });
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  throw lastError ?? new Error('gen-image failed');
}
