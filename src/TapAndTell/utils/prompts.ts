// Pre-baked opening scene archetypes (used when user doesn't upload a photo).
// Each archetype is a short visual hook + a longer img-gen prompt.

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
    id: 'cabin',
    label: 'A cabin in the snow',
    hook: 'A small wooden cabin alone in a snowy pine forest.',
    prompt:
      'cinematic still of the figure standing outside a small wooden cabin alone ' +
      'in a snowy pine forest at dusk, warm light glowing from one window, ' +
      'soft snowfall, the figure half-silhouette against the window glow, ' +
      'muted color grade, atmospheric, photoreal, 1:1',
  },
  {
    id: 'beach',
    label: 'A figure on an empty beach',
    hook: 'A lone figure standing on a wide grey beach at low tide.',
    prompt:
      'cinematic still of the figure standing alone on a wide grey beach at low tide, ' +
      'overcast sky, soft diffuse light, distant lighthouse on the horizon, ' +
      'long coat fluttering, desaturated palette, photoreal, 1:1',
  },
  {
    id: 'street',
    label: 'An empty city street at night',
    hook: 'A rain-slick city street with one neon sign flickering.',
    prompt:
      'cinematic still of the figure walking down an empty narrow city street at night, ' +
      'wet asphalt reflecting one flickering pink neon sign, fog drifting through, ' +
      'cinematic noir lighting, photoreal, 1:1',
  },
  {
    id: 'desert',
    label: 'A road through the desert',
    hook: 'A straight desert road vanishing into a heat-shimmered horizon.',
    prompt:
      'cinematic still of the figure standing on a straight desert road ' +
      'vanishing into a heat-shimmered horizon, dusty mesas in the distance, ' +
      'golden hour, warm tones, long shadow stretching across the asphalt, photoreal, 1:1',
  },
];

// Photoreal-prep prompt — used as the first img2img step to translate any
// avatar (stylized AI art, anime, painted, etc) into a photoreal portrait
// while preserving identity markers (hair color, clothing, face structure).
// Without this step, stylized avatars cause style mismatch when scene-genning
// a photoreal cinematic frame — see /ab/ A/B test page for evidence.
export const PHOTOREAL_PREP_PROMPT =
  'realistic photographic portrait of the same person from the reference, ' +
  'photoreal, natural skin texture with subtle pores and imperfections, ' +
  'soft studio lighting, head and shoulders shot, neutral background, ' +
  'preserve hair color and clothing colors from the reference, ' +
  'high detail, photoreal, 1:1';

// System prompt for LLM that turns a tap location + short user text into
// (a) three chip suggestions and (b) a video prompt for the transition.
export const STORY_SYSTEM_PROMPT = `You are a wordless cinematographer helping a player chain a 1-2 beat visual story.
The player sees a still image. They tap a spot on it and type a short clue about what happens next.
You ALWAYS reply with strict JSON of the shape:
{
  "chips": ["short verb phrase 1", "verb phrase 2", "verb phrase 3"],
  "next_image_prompt": "cinematic still description for the resulting end frame, 1 sentence",
  "video_prompt": "describe the motion/transition that takes us there, 1 sentence"
}
Chips are 1-3 word evocative continuations grounded in what the player tapped (e.g. if they tapped a window: "lights flicker", "curtain falls", "shadow appears").
next_image_prompt must MATCH the current frame's composition (same camera angle, same subject placement) while adding the new event.
video_prompt describes the motion that links current frame to next: weather, lighting, motion, camera move.
Keep tone cinematic, photoreal, atmospheric. Never describe the player or any person directly — refer to subjects by what they are ("the figure", "the cabin", "the window").`;
