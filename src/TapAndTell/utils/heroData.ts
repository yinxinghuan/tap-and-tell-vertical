// Hero showcase data — fed by scripts/gen_hero_videos.py output.
// While that script is still running, we use the spike cabin clip as the sole hero
// and add 5 deferred placeholders. Real entries get spliced in from hero_videos.json.

export interface HeroEntry {
  id: string;
  caption: string;
  video_url: string;
  a_url?: string;
  b_url?: string;
}

// Loaded at app boot from /tap-and-tell/hero_videos.json (in public/) once it exists.
// Until then this seed list keeps the UI populated with the spike sample.
const SEED: HeroEntry[] = [
  {
    id: 'cabin-spike',
    caption: 'a cabin warms in winter',
    video_url: 'https://cdn.aiwaves.tech/prodsv/telegram/video/123456/20260527-133040.mp4',
    a_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779827243649029.webp',
    b_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779859812186600.webp',
  },
];

export async function loadHeroEntries(): Promise<HeroEntry[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}hero_videos.json`, { cache: 'no-store' });
    if (!res.ok) return SEED;
    const list = (await res.json()) as Array<{
      id: string;
      caption?: string;
      video_url?: string;
      a_url?: string;
      b_url?: string;
      error?: string;
    }>;
    const cleaned: HeroEntry[] = list
      .filter(e => !e.error && e.video_url && e.caption)
      .map(e => ({
        id: e.id,
        caption: e.caption!,
        video_url: e.video_url!,
        a_url: e.a_url,
        b_url: e.b_url,
      }));
    return cleaned.length > 0 ? cleaned : SEED;
  } catch {
    return SEED;
  }
}

export function getSeed(): HeroEntry[] {
  return SEED;
}
