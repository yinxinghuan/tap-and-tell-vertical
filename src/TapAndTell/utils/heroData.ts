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

// Seed entries — fallback if hero_videos.json fetch fails (Aigram WebView can
// be flaky with cache: 'no-store' / dynamic JSON). Defensive: include every
// shipped scene so even on fetch failure users see variety, not just one
// cabin (was the symptom: every hero looked like cabin → every remix entered
// cabin scene). Keep ids in sync with ARCHETYPES in utils/prompts.ts — the
// picker selection drives makeYours by id.
//
// video_url omitted entries (attic / arcade / laundromat / phone-booth /
// rooftop) are still being baked by scripts/gen_hero_videos_v2.py. Until then
// the big hero card falls back to a static <img src={a_url}>.
const SEED: HeroEntry[] = [
  {
    id: 'kitchen',
    caption: 'the kettle starts to whistle',
    video_url: 'https://cdn.aiwaves.tech/prodsv/telegram/video/123456/20260528-211051.mp4',
    a_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779972974431904.webp',
    b_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779973067749817.webp',
  },
  {
    id: 'diner',
    caption: 'neon flickers on the rain',
    video_url: 'https://cdn.aiwaves.tech/prodsv/telegram/video/123456/20260528-211448.mp4',
    a_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779973318795427.webp',
    b_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779973412037080.webp',
  },
  {
    id: 'garden',
    caption: 'fireflies find the table',
    video_url: 'https://cdn.aiwaves.tech/prodsv/telegram/video/123456/20260528-211801.mp4',
    a_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779973674008191.webp',
    b_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779973767368717.webp',
  },
  {
    id: 'bookstore',
    caption: 'a book slides out on its own',
    video_url: 'https://cdn.aiwaves.tech/prodsv/telegram/video/123456/20260528-211659.mp4',
    a_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779974022082719.webp',
    b_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779974126072430.webp',
  },
  {
    id: 'music',
    caption: 'a key presses by itself',
    video_url: 'https://cdn.aiwaves.tech/prodsv/telegram/video/123456/20260528-212242.mp4',
    a_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779974367981385.webp',
    b_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779974468979576.webp',
  },
  {
    id: 'attic',
    caption: 'the tarp slides off',
    video_url: '',
    a_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1780306563228166.webp',
  },
  {
    id: 'arcade',
    caption: 'a machine flickers on',
    video_url: '',
    a_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1780306569607095.webp',
  },
  {
    id: 'laundromat',
    caption: 'a dryer thumps awake',
    video_url: '',
    a_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1780306575517226.webp',
  },
  {
    id: 'phone-booth',
    caption: 'the phone starts to ring',
    video_url: '',
    a_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1780306581531672.webp',
  },
  {
    id: 'rooftop',
    caption: 'the city goes silent',
    video_url: '',
    a_url: 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1780306587515251.webp',
  },
];

export async function loadHeroEntries(): Promise<HeroEntry[]> {
  // Cache-bust via query string instead of `cache: 'no-store'` — the option
  // is silently ignored or breaks fetch entirely in some embedded WebViews
  // (including older Aigram contexts). A query param works universally.
  const url = `${import.meta.env.BASE_URL}hero_videos.json?v=${Date.now()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`hero_videos.json fetch HTTP ${res.status} — using SEED`);
      return SEED;
    }
    const list = (await res.json()) as Array<{
      id: string;
      caption?: string;
      video_url?: string;
      a_url?: string;
      b_url?: string;
      error?: string;
    }>;
    // Accept entries with either a video OR a poster image. The new v2.1 scenes
    // (attic / arcade / laundromat / phone-booth / rooftop) ship with only an
    // a_url until the async video script catches up; HomeScreen falls back to
    // a static <img> when video_url is empty.
    const cleaned: HeroEntry[] = list
      .filter(e => !e.error && e.caption && (e.video_url || e.a_url))
      .map(e => ({
        id: e.id,
        caption: e.caption!,
        video_url: e.video_url ?? '',
        a_url: e.a_url,
        b_url: e.b_url,
      }));
    return cleaned.length > 0 ? cleaned : SEED;
  } catch (e) {
    console.warn('hero_videos.json fetch threw — using SEED:', e);
    return SEED;
  }
}

export function getSeed(): HeroEntry[] {
  return SEED;
}
