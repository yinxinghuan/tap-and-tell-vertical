// Direct calls to the seetacloud video gen endpoint.
// CORS confirmed open (Access-Control-Allow-Origin: *) — no proxy needed.
//
// Submit endpoint:  POST https://.../video       body {query, params:{image_url,end_image_url,prompt,env}}
// Poll endpoint:    POST https://.../video_task  body {query, params:{task_id}}
//
// IMPORTANT: the gen-video SKILL.md example has a URL bug — `${VIDEO_API}/video`
// double-paths. We hit /video and /video_task directly here.
//
// Known failure mode (2026-05-27): backend returns status=failed with
// `log: "process error, generate failed!"` when the GPU's OSS upload to
// Alibaba Cloud times out. The model bytes are gone by then — only fix is to
// resubmit. We auto-retry up to N times client-side so users don't see flake.

const SUBMIT_URL = 'https://u545921-b746-8a491f44.westc.seetacloud.com:8443/video';
const POLL_URL = 'https://u545921-b746-8a491f44.westc.seetacloud.com:8443/video_task';

export interface SubmitVideoOpts {
  image_url: string;
  end_image_url: string;
  prompt: string;
  env?: 'prod' | 'test';
}

export interface PollResult {
  status: 'processing' | 'success' | 'failed';
  url?: string;
  log?: string;
}

export interface ProgressInfo {
  /** Seconds elapsed in the current attempt. */
  seconds: number;
  /** 1-indexed attempt counter. */
  attempt: number;
  /** Max attempts allowed (= maxAttempts param). */
  maxAttempts: number;
  /** True while we're in the inter-attempt backoff sleep. */
  retrying: boolean;
}

export async function submitVideo(opts: SubmitVideoOpts): Promise<string> {
  const body = {
    query: '',
    params: {
      image_url: opts.image_url,
      end_image_url: opts.end_image_url,
      prompt: opts.prompt,
      env: opts.env ?? 'prod',
      // v2.0 Vertical: ask backend for portrait output. Backend center-crops
      // 1:1 input frames to 9:16, then model outputs 768×1024 (3:4 portrait).
      // True 9:16 (576×1024) would crop half the input, too aggressive for
      // the typical center-composed scenes. 3:4 is the chosen compromise.
      // Param confirmed by colleague 2026-05-28 + verified in test
      // task f2358c05-92d8-4833-81da-37338cb5daf7.
      target_image_ratio: '9x16',
    },
  };
  const res = await fetch(SUBMIT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`video submit: HTTP ${res.status}`);
  const json = (await res.json()) as { task_id?: string };
  if (!json.task_id) throw new Error('video submit: no task_id');
  return json.task_id;
}

export async function pollOnce(task_id: string): Promise<PollResult> {
  const res = await fetch(POLL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '', params: { task_id } }),
  });
  if (!res.ok) throw new Error(`video poll: HTTP ${res.status}`);
  return (await res.json()) as PollResult;
}

/**
 * Submit + poll one attempt. Returns the video URL on success, throws on failure.
 */
async function runOnce(
  opts: SubmitVideoOpts,
  onTick: (seconds: number) => void,
  pollIntervalMs: number,
  timeoutMs: number,
): Promise<string> {
  const task_id = await submitVideo(opts);
  const t0 = Date.now();
  const deadline = t0 + timeoutMs;
  while (Date.now() < deadline) {
    const r = await pollOnce(task_id);
    onTick(Math.floor((Date.now() - t0) / 1000));
    if (r.status === 'success') {
      if (!r.url) throw new Error('video poll: success without url');
      return r.url;
    }
    if (r.status === 'failed') {
      // Throw with the task_id so caller can log / report
      throw new Error(`video failed (task ${task_id}): ${r.log || 'no log'}`);
    }
    await new Promise(rr => setTimeout(rr, pollIntervalMs));
  }
  throw new Error('video poll: timed out');
}

/**
 * Submit + poll with automatic retry on `failed` status (the OSS upload
 * timeout failure mode). Resolves with the result video URL.
 *
 * Retry policy: maxAttempts total tries, fixed `backoffMs` sleep between
 * attempts. onProgress fires every poll tick with elapsed seconds, current
 * attempt number, and a `retrying` flag during the backoff sleep.
 *
 * The original `onProgress(seconds: number) => void` signature is preserved
 * via overload — old callers continue to work.
 */
export async function generateVideo(
  opts: SubmitVideoOpts,
  onProgress?: ((info: ProgressInfo) => void) | ((seconds: number) => void),
  pollIntervalMs = 5000,
  timeoutMs = 30 * 60 * 1000,
  maxAttempts = 4,
  backoffMs = 60 * 1000,
): Promise<string> {
  const notify = (info: ProgressInfo) => {
    if (!onProgress) return;
    // Detect single-arg progress fn (legacy callers)
    if (onProgress.length <= 1) {
      (onProgress as (s: number) => void)(info.seconds);
    } else {
      (onProgress as (i: ProgressInfo) => void)(info);
    }
  };

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const url = await runOnce(
        opts,
        s => notify({ seconds: s, attempt, maxAttempts, retrying: false }),
        pollIntervalMs,
        timeoutMs,
      );
      return url;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // Retry on:
      //   - 'video failed' = OSS upload to Aliyun timed out (model bytes generated, upload step lost them)
      //   - HTTP 429 = rate-limited at submit step (proxy or seetacloud cooldown)
      //   - HTTP 5xx = transient server error
      const isRetriable =
        /video failed/.test(lastError.message) ||
        /HTTP 429/.test(lastError.message) ||
        /HTTP 5\d\d/.test(lastError.message);
      if (!isRetriable || attempt >= maxAttempts) break;
      // Backoff sleep, ticking progress so UI can show "retrying in Xs"
      for (let s = 0; s < backoffMs / 1000; s++) {
        notify({ seconds: s, attempt: attempt + 1, maxAttempts, retrying: true });
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  throw lastError ?? new Error('video gen failed');
}
