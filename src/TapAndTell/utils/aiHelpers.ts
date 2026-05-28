// Helpers that talk to the platform LLM (chat.aiwaves.tech/.../game-chat).
// Used to (a) suggest chip continuations + (b) generate the next_image_prompt
// and video_prompt that match the current frame.

import { STORY_SYSTEM_PROMPT } from './prompts';

const CHAT_URL = 'https://chat.aiwaves.tech/aigram/api/game-chat';

export interface BeatPlan {
  chips: string[];
  next_image_prompt: string;
  video_prompt: string;
}

/** Send one stateless turn to the chat endpoint and parse JSON. */
export async function planBeat(
  current_frame_prompt: string,
  tap_pct: { x: number; y: number } | null,
  user_clue: string,
): Promise<BeatPlan> {
  const tap_note = tap_pct
    ? `The player tapped at (${Math.round(tap_pct.x * 100)}%, ${Math.round(tap_pct.y * 100)}%) of the frame.`
    : 'The player did not tap a specific spot.';
  const user_msg =
    `Current frame description: ${current_frame_prompt}\n` +
    `${tap_note}\n` +
    `Player's clue for what happens next: "${user_clue || '(none — just continue the story)'}"\n` +
    `Return JSON only.`;

  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: STORY_SYSTEM_PROMPT },
        { role: 'user', content: user_msg },
      ],
    }),
  });
  if (!res.ok) throw new Error(`chat: HTTP ${res.status}`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = json.choices?.[0]?.message?.content ?? '';
  return parseBeatPlan(reply);
}

function parseBeatPlan(raw: string): BeatPlan {
  // Strip code fences if present
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
  // Find first JSON object in the string
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) {
    return {
      chips: [],
      next_image_prompt: 'cinematic still continuation of the previous scene',
      video_prompt: 'slow cinematic camera push-in',
    };
  }
  try {
    const obj = JSON.parse(m[0]) as Partial<BeatPlan>;
    return {
      chips: Array.isArray(obj.chips) ? obj.chips.slice(0, 3).filter(s => typeof s === 'string') : [],
      next_image_prompt:
        typeof obj.next_image_prompt === 'string'
          ? obj.next_image_prompt
          : 'cinematic still continuation of the previous scene',
      video_prompt:
        typeof obj.video_prompt === 'string'
          ? obj.video_prompt
          : 'slow cinematic camera push-in',
    };
  } catch {
    return {
      chips: [],
      next_image_prompt: 'cinematic still continuation of the previous scene',
      video_prompt: 'slow cinematic camera push-in',
    };
  }
}

// Random teaser lines for loading states (no animation, just text rotation).
export const TEASER_LINES = [
  'somewhere in the frame, something shifts…',
  'the camera holds its breath…',
  'a single drop of light begins to move…',
  'the silence thickens…',
  'a shadow leans forward…',
  'the air starts to change temperature…',
  'one detail you forgot is about to matter…',
  'it has not yet happened, but it is about to…',
];

export function pickTeaser(): string {
  return TEASER_LINES[Math.floor(Math.random() * TEASER_LINES.length)];
}
