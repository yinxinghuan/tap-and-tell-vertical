// Cache the photoreal intermediate by source avatar URL.
// First-time `makeYours` for a given avatar runs the photoreal-prep step (~200s).
// Subsequent runs reuse the cached intermediate (0s).
//
// Cache lives in localStorage. Cleared if the source avatar URL changes
// (e.g. user updates their Aigram avatar — different URL → cache miss → fresh prep).

const KEY = 'tap-and-tell/photoreal-prep/v1';

interface Entry {
  source: string;       // original avatar URL we prep'd from
  intermediate: string; // photoreal intermediate URL on the platform CDN
  ts: number;           // when we did the prep
}

function readAll(): Record<string, Entry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Entry>;
  } catch {
    return {};
  }
}

function writeAll(obj: Record<string, Entry>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    /* quota / private mode — silently ignore */
  }
}

/** Get cached photoreal intermediate for a given avatar URL, or null if miss. */
export function getPhotoreal(avatarUrl: string): string | null {
  const all = readAll();
  const hit = all[avatarUrl];
  return hit?.intermediate ?? null;
}

/** Save the photoreal intermediate for a given avatar URL. */
export function setPhotoreal(avatarUrl: string, intermediateUrl: string) {
  const all = readAll();
  all[avatarUrl] = {
    source: avatarUrl,
    intermediate: intermediateUrl,
    ts: Date.now(),
  };
  writeAll(all);
}

/** Drop the cached intermediate — useful if user reports bad output and wants to regenerate. */
export function clearPhotoreal(avatarUrl?: string) {
  if (!avatarUrl) {
    localStorage.removeItem(KEY);
    return;
  }
  const all = readAll();
  delete all[avatarUrl];
  writeAll(all);
}
