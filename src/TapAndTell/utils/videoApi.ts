import { getGameUuid } from '@shared/runtime';
import { createMediaRequestId, getMediaTask, MediaServiceError, submitVideoMedia } from '@shared/runtime/media';

export interface SubmitVideoOpts {
  image_url: string;
  end_image_url: string;
  prompt: string;
  env?: 'prod' | 'test';
  task_id?: string;
  onTaskCreated?: (taskId: string) => void;
}
export interface ProgressInfo { seconds: number; attempt: number; maxAttempts: number; retrying: boolean; }
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function submitWithAmbiguousRetry(opts: SubmitVideoOpts, requestId: string): Promise<string> {
  const sessionId = getGameUuid();
  if (!sessionId) throw new Error('video submit: permanent game UUID is required');
  let lastError: unknown;
  for (let networkAttempt = 0; networkAttempt < 2; networkAttempt++) {
    try {
      const task = await submitVideoMedia({
        sessionId, requestId, prompt: opts.prompt,
        soundPrompt: 'natural cinematic ambience matching the visible action, no dialogue, no music',
        startUrl: opts.image_url, endUrl: opts.end_image_url, ratio: '9:16', durationSeconds: 5,
      });
      return task.task_id;
    } catch (error) {
      lastError = error;
      if (error instanceof MediaServiceError) throw error;
      if (networkAttempt === 0) await delay(2_000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function pollTask(taskId: string, onTick: (seconds: number) => void, timeoutMs: number): Promise<string> {
  const startedAt = Date.now(), deadline = startedAt + timeoutMs;
  while (Date.now() < deadline) {
    let task: Awaited<ReturnType<typeof getMediaTask>>;
    try {
      task = await getMediaTask(taskId);
    } catch (error) {
      if (error instanceof MediaServiceError && error.retryable) {
        await delay(Math.max(8, error.retryAfterSeconds ?? 10) * 1_000);
        continue;
      }
      throw error;
    }
    onTick(Math.floor((Date.now() - startedAt) / 1000));
    if (task.status === 'succeeded') {
      if (task.media?.type !== 'video') throw new Error('video poll: success without video media');
      return task.media.url;
    }
    await delay(10_000);
  }
  throw new MediaServiceError('TIMEOUT', 'Video generation timed out', 0, true);
}

export async function generateVideo(
  opts: SubmitVideoOpts, onProgress?: (info: ProgressInfo) => void,
  _pollIntervalMs = 10_000, timeoutMs = 30 * 60 * 1000, maxAttempts = 3,
): Promise<string> {
  let lastError: Error | undefined, resumeTaskId = opts.task_id;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const taskId = resumeTaskId ?? await submitWithAmbiguousRetry(opts, createMediaRequestId());
      resumeTaskId = undefined;
      opts.onTaskCreated?.(taskId);
      return await pollTask(taskId, seconds => onProgress?.({ seconds, attempt, maxAttempts, retrying: false }), timeoutMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const retryable = error instanceof MediaServiceError && error.retryable && error.code !== 'TIMEOUT';
      if (!retryable || attempt >= maxAttempts) break;
      const waitSeconds = Math.max(8, error.retryAfterSeconds ?? 15);
      for (let remaining = waitSeconds; remaining > 0; remaining--) {
        onProgress?.({ seconds: waitSeconds - remaining, attempt: attempt + 1, maxAttempts, retrying: true });
        await delay(1_000);
      }
    }
  }
  throw lastError ?? new Error('video generation failed');
}
