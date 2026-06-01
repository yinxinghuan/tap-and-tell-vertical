// Pre-baked opening scene archetypes (used when user doesn't upload a photo).
// Each archetype is a short visual hook + a longer img-gen prompt.
//
// Each `id` here MUST match a hero entry id (heroData.ts + public/hero_videos.json).
// The picker on HomeScreen drives both the showcased hero AND which archetype
// "Make yours" uses — there is no random selection. Picker == intent.

export interface SceneArchetype {
  id: string;
  label: string;
  hook: string;
  prompt: string;
}

// NOTE: prompts say "the figure" (subject-agnostic) — never gender / age / look.
// When img2img runs with the user's avatar as ref, the avatar's likeness fills
// that slot; without a ref, txt2img generates a generic figure.
// See feedback_img2img_subject_agnostic_prompt.md.
export const ARCHETYPES: SceneArchetype[] = [
  {
    id: 'kitchen',
    label: 'A small kitchen at midnight',
    hook: 'A small kitchen at midnight with a kettle starting to steam.',
    prompt:
      'cinematic still of the figure standing in a small domestic kitchen at midnight, ' +
      'single warm pendant light over the counter, an enameled kettle on the stove ' +
      'just starting to steam softly, dark wood cabinets, condensation on the window, ' +
      'warm muted palette, atmospheric, photoreal, 1:1',
  },
  {
    id: 'diner',
    label: 'An empty 1950s diner on a rainy night',
    hook: 'An empty red-vinyl diner booth with neon outside in the rain.',
    prompt:
      'cinematic still of the figure sitting alone in a red vinyl booth inside an ' +
      'empty 1950s diner at night, rain streaks on the window, pink neon reflection in ' +
      'the glass, jukebox glowing dimly in the corner, fluorescent overhead lighting, ' +
      'hopper noir mood, photoreal, 1:1',
  },
  {
    id: 'garden',
    label: 'A garden table at golden hour',
    hook: 'A garden table set with mismatched china, string lights overhead.',
    prompt:
      'cinematic still of the figure standing beside a garden table set with mismatched ' +
      'china and wildflowers, string lights overhead but not yet lit, golden hour sunlight ' +
      'through the trees, warm summer afternoon, painterly atmospheric, photoreal, 1:1',
  },
  {
    id: 'bookstore',
    label: 'A narrow used-bookstore aisle',
    hook: 'A narrow aisle in a dusty used bookstore.',
    prompt:
      'cinematic still of the figure standing in a narrow used-bookstore aisle, tall ' +
      'shelves of weathered books on both sides, a single warm pendant light, dust drifting ' +
      'through the beam, deep brown wood, the figure half-turned looking at a shelf, ' +
      'warm sepia palette, photoreal, 1:1',
  },
  {
    id: 'music',
    label: 'A sunlit music room with an upright piano',
    hook: 'An old upright piano in a quiet sunlit music room.',
    prompt:
      'cinematic still of the figure seated at an old upright piano in a sunlit music ' +
      'room, dust motes floating in a shaft of light through tall windows, sheet music open ' +
      'on the stand, polished wood floor, the figure resting hands on the keys, ' +
      'muted nostalgic palette, photoreal, 1:1',
  },
  {
    id: 'attic',
    label: 'A dusty attic under a bare bulb',
    hook: 'A dusty attic with sheet-covered furniture under a single bulb.',
    prompt:
      'cinematic still of the figure standing in a dusty attic with covered furniture ' +
      'under white sheets, a single bare bulb hanging, dust motes in the slanted afternoon ' +
      'light from a small dormer window, wooden rafters and exposed beams, the figure ' +
      'half-shadowed, photoreal, 1:1',
  },
  {
    id: 'arcade',
    label: 'A 90s arcade after closing',
    hook: 'Rows of dim arcade cabinets after the lights went out.',
    prompt:
      'cinematic still of the figure standing alone in an empty 1990s arcade after ' +
      'closing, rows of dim cabinet screens, faint neon CRT glow on stained carpet, no ' +
      'other people, faded posters peeling from the wall, photoreal, 1:1',
  },
  {
    id: 'laundromat',
    label: 'A 24-hour laundromat at 3am',
    hook: 'A 24h laundromat under fluorescent light at 3am.',
    prompt:
      'cinematic still of the figure sitting on a plastic chair in a 24-hour laundromat ' +
      'at 3am, fluorescent overhead lights, one dryer door slightly open, linoleum floor, ' +
      'rain-streaked front window, americana lonely mood, photoreal, 1:1',
  },
  {
    id: 'phone-booth',
    label: 'A red phone booth in the rain',
    hook: 'A glass phone booth lit from inside, rain falling.',
    prompt:
      'cinematic still of the figure standing inside a red glass phone booth on an empty ' +
      'street corner at night, rain falling outside, the booth lit warmly from inside, ' +
      'fogged glass, wet asphalt reflections, the figure half-silhouette, photoreal, 1:1',
  },
  {
    id: 'rooftop',
    label: 'A city rooftop at golden hour',
    hook: 'A quiet city rooftop, rusted water tower, hazy skyline.',
    prompt:
      'cinematic still of the figure standing on a quiet city rooftop at golden hour, ' +
      'rusted water tower behind, a forest of antennas in the distance, soft haze over ' +
      'the skyline, the figure facing the horizon, warm muted palette, photoreal, 1:1',
  },
];

// Photoreal-prep prompt — img2img the avatar into a clean portrait that's
// (a) photoreal style, (b) faithful to the subject (human OR non-human), and
// (c) ISOLATED on a plain background so the downstream scene gen isn't biased
// by the prep's background.
//
// History:
//   v1: said "the same person" → forced human interpretation, broke ghost / mascot avatars.
//   v2: added a "ghost in a sheet" example → model picked up "ghost" context and
//       produced ghost-in-haunted-snowy-cabin intermediates, which then biased
//       EVERY downstream scene to look like the same snowy cabin.
//   v3 (current): no examples, focus on "isolated portrait on plain background".
//       Costume/non-human preservation is generalized to "every distinguishing
//       feature, whatever it is".
export const PHOTOREAL_PREP_PROMPT =
  'photoreal head-and-shoulders portrait of the exact subject from the ' +
  'reference image, completely ISOLATED on a plain neutral grey studio ' +
  'background, soft even studio lighting, no environment or scenery, ' +
  'preserve every distinguishing feature of the subject — silhouette, mask, ' +
  'costume, sheet, fur, clothing, hair, face, accessories — whatever the ' +
  'subject is (human, character, mascot, animal, ghost, etc), render the ' +
  'same thing in a photoreal style. Natural material texture, high detail, ' +
  'sharp focus on the subject, photoreal, 1:1';

// System prompt for LLM that turns a tap location + short user text into
// (a) chip suggestions, (b) the next image prompt, and (c) a video prompt.
//
// History:
//   v1: was overly restrictive — "same subject placement", chip examples were
//       all environmental, video_prompt list said "weather, lighting, motion"
//       without forcing figure motion. Result: video model got frame A + frame
//       B with identical poses → only the environment animated, the figure
//       stayed frozen. Reported by user 2026-06-01.
//   v2 (current): explicitly requires figure motion in chips + next_image +
//       video_prompt. Demands a concrete physical verb every time.
export const STORY_SYSTEM_PROMPT = `You are a wordless cinematographer helping a player chain a 1-2 beat visual story.
The player sees a still image. They tap a spot on it and type a short clue about what happens next.

You ALWAYS reply with strict JSON of the shape:
{
  "chips": ["short verb phrase 1", "verb phrase 2", "verb phrase 3"],
  "next_image_prompt": "cinematic still description for the resulting end frame, 1 sentence",
  "video_prompt": "describe the motion that takes us from current frame to next, 1 sentence"
}

CHIPS — 1-3 word evocative continuations grounded in the tap location. Mix figure-actions with environment. At LEAST ONE chip MUST imply the figure doing something physical (e.g. on a window tap: "presses palm to glass" / "leans closer" / "turns away"). It is a bug if all three chips are environment-only ("lights flicker", "fog thickens", "rain intensifies") — that produces frozen-figure videos downstream.

NEXT_IMAGE_PROMPT — the broad composition stays recognizable (same scene, same camera angle, same general region of the frame for the figure) BUT the figure must have visibly SHIFTED to a new pose, gesture, head turn, hand position, or step. Don't write two identical postcards with weather-change. Write "the same scene a few seconds later, with the figure clearly mid-action."

VIDEO_PROMPT — this is the motion brief for a first-to-last-frame interpolation video model. You MUST describe TWO things in one sentence: (1) a clear physical ACTION the figure performs, using a concrete verb (turns, leans, steps forward, reaches out, raises a hand, sits down, lowers their head, kneels, looks up, walks toward, presses); AND (2) the environment / lighting / weather shift that accompanies it. Without an explicit figure verb, the model freezes the figure and animates only the environment — that is the failure mode this rule exists to prevent.

TONE — cinematic, photoreal, atmospheric. Refer to subjects by what they are ("the figure", "the cabin", "the window"). NEVER describe identity markers (gender, age, ethnicity, hair, looks).`;

// System prompt for the LLM call that backs the picker's "Surprise me"
// random-scene option. Returns JSON {caption, prompt} where prompt is fed
// directly to the same gen-image pipeline that ARCHETYPES use.
export const INVENT_SCENE_SYSTEM_PROMPT = `You are a cinematographer inventing a single fresh photoreal opening scene for a short visual story game.

The result will be rendered as a 1:1 photoreal still image with the player's avatar inserted as "the figure". Then the player will tap somewhere on the still and a 5-second video continuation will be generated.

Your job: invent ONE opening scene that is visually distinct, atmospheric, and gives the player something interesting to tap. The scene should have:
- a clear, named LOCATION (one place, not a vague mood)
- specific tactile/visual details (an object, a light source, a weather state, a texture)
- a SINGLE figure positioned in the scene with a readable pose (standing, seated, leaning, half-turned, walking) — NOT a frozen statue pose
- a time-of-day and lighting feeling

Reply with strict JSON ONLY:
{
  "caption": "3-6 word evocative phrase naming the scene (lowercase, no period)",
  "prompt": "full img-gen prompt, single paragraph, ending with: photoreal, 1:1"
}

Caption examples: "the lighthouse waits out the storm", "a tram pauses in the snow", "the gallery after closing".

Prompt format: 'cinematic still of the figure {posed/action} in {location}, {specific details}, {time + lighting}, photoreal, 1:1'. Never describe identity (gender / age / looks) — always "the figure". Vary locations across calls: indoor, outdoor, public, private, urban, rural, day, dusk, night, weather. Don't reuse obvious clichés (no more cabins, beaches, attics, etc — the user has already seen those).`;
