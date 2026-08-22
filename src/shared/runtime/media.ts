const DEFAULT_MEDIA_API_BASE = 'https://game.aiwaves.tech/alteru-media/api';

export type MediaTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type MediaImageMode = 'text' | 'edit' | 'avatar';
export interface MediaImage { type: 'image'; url: string; width: number; height: number; format: 'png' | 'webp'; }
export interface MediaVideo { type: 'video'; url: string; width: number; height: number; duration_seconds: number; has_audio: boolean; }
export interface MediaTask {
  task_id: string; request_id: string; type: 'image' | 'video' | 'audio'; status: MediaTaskStatus;
  media?: MediaImage | MediaVideo; error?: { code: string; message: string; retryable: boolean };
  timing_ms?: number; created_at: number; updated_at: number;
}
export interface MediaClientOptions { baseUrl?: string; signal?: AbortSignal; }
export class MediaServiceError extends Error {
  constructor(
    public readonly code: string, message: string, public readonly status: number,
    public readonly retryable: boolean, public readonly retryAfterSeconds?: number,
  ) { super(message); this.name = 'MediaServiceError'; }
}
export function createMediaRequestId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new MediaServiceError('RUNTIME_UNAVAILABLE', 'crypto.randomUUID is unavailable', 0, false);
  }
  return crypto.randomUUID();
}
export function fitMediaImageSize(requested: { width: number; height: number }) {
  const ratio = Math.max(1, requested.width) / Math.max(1, requested.height);
  const areaTarget = Math.min(Math.max(1, requested.width * requested.height), 1_572_864);
  let best = { width: 512, height: 512 }, bestScore = Number.POSITIVE_INFINITY;
  for (let width = 256; width <= 1536; width += 64) for (let height = 256; height <= 1536; height += 64) {
    const area = width * height; if (area > 1_572_864) continue;
    const score = Math.abs(Math.log((width / height) / ratio)) * 4 + Math.abs(Math.log(area / areaTarget));
    if (score < bestScore) { bestScore = score; best = { width, height }; }
  }
  return best;
}
async function requestTask(path: string, init: RequestInit, options?: MediaClientOptions): Promise<MediaTask> {
  const response = await fetch(`${(options?.baseUrl ?? DEFAULT_MEDIA_API_BASE).replace(/\/+$/, '')}${path}`, {
    ...init, headers: { 'Content-Type': 'application/json', ...init.headers },
    ...(options?.signal ? { signal: options.signal } : {}),
  });
  let body: any = null; try { body = await response.json(); } catch { /* handled below */ }
  if (!response.ok) throw new MediaServiceError(
    body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? `Media Service failed with HTTP ${response.status}`,
    response.status, body?.error?.retryable ?? response.status >= 500, body?.error?.details?.retry_after_seconds,
  );
  const task = body as MediaTask;
  if (task.status === 'failed') throw new MediaServiceError(
    task.error?.code ?? 'GENERATION_FAILED', task.error?.message ?? 'Media generation failed',
    200, task.error?.retryable ?? false,
  );
  return task;
}
export function getMediaTask(taskId: string, options?: MediaClientOptions): Promise<MediaTask> {
  return requestTask(`/v1/tasks/${encodeURIComponent(taskId.trim())}`, { method: 'GET' }, options);
}
export async function generateImageMedia(request: {
  sessionId: string; requestId?: string; mode: MediaImageMode; prompt: string;
  referenceUrls?: string[]; size: { width: number; height: number };
}, options?: MediaClientOptions): Promise<MediaTask & { media: MediaImage }> {
  const task = await requestTask('/v1/images/generations', { method: 'POST', body: JSON.stringify({
    request_id: request.requestId ?? createMediaRequestId(), session_id: request.sessionId.trim(),
    mode: request.mode, prompt: request.prompt.trim(), reference_urls: request.referenceUrls ?? [],
    size: fitMediaImageSize(request.size),
  }) }, options);
  if (task.status !== 'succeeded' || task.media?.type !== 'image') {
    throw new MediaServiceError('INVALID_RESPONSE', 'Image task completed without image media', 200, false);
  }
  return task as MediaTask & { media: MediaImage };
}
export function submitVideoMedia(request: {
  sessionId: string; requestId?: string; prompt: string; soundPrompt?: string;
  startUrl: string; endUrl: string; ratio: '9:16'; durationSeconds: 5;
}, options?: MediaClientOptions): Promise<MediaTask> {
  return requestTask('/v1/videos/generations', { method: 'POST', body: JSON.stringify({
    request_id: request.requestId ?? createMediaRequestId(), session_id: request.sessionId.trim(),
    prompt: request.prompt.trim(), ...(request.soundPrompt?.trim() ? { sound_prompt: request.soundPrompt.trim() } : {}),
    start_url: request.startUrl.trim(), end_url: request.endUrl.trim(), ratio: request.ratio,
    duration_seconds: request.durationSeconds,
  }) }, options);
}
