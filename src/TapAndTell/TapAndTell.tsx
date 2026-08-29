// Tap & Tell — main orchestrator + all phases. AlterU-branded v0.2.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGenImage, callAigramAPI, getTelegramId, isInAigramNow, useGameEvent } from '@shared/runtime';
import { waitForAigramIdentity } from '@shared/runtime/identity-ready';
import { useGameSave } from '@shared/save';
import { generateVideo, type ProgressInfo } from './utils/videoApi';
import { MediaServiceError } from '@shared/runtime/media';
import { planBeat, pickTeaser, inventScenePrompt, type BeatPlan } from './utils/aiHelpers';
import { ARCHETYPES } from './utils/prompts';
import { loadHeroEntries, getSeed, type HeroEntry } from './utils/heroData';
import { genImageWithRetry, type RetryProgress as GenImgRetry } from './utils/genImageWithRetry';
import { preloadImage, preloadVideo } from './utils/preload';
import AlteruEmblem from './components/AlteruEmblem';
import WallScreen from './screens/WallScreen';
import { useWallEntries, type WallEntry } from './utils/useWallEntries';
import { t } from './i18n';
import './TapAndTell.less';

type Phase = 'home' | 'prep' | 'gen-a' | 'tap' | 'gen-b' | 'gen-video' | 'play' | 'error' | 'wall';

interface TapSpot { x: number; y: number; }
interface Avatar { url: string; name: string; isDemo: boolean; }
interface PendingVideo {
  taskId?: string;
  frameAUrl: string;
  frameBUrl: string;
  prompt: string;
  clue: string;
  tap: TapSpot;
}

/**
 * A single published story.
 */
export interface StorySave {
  a_url: string;
  b_url: string;
  video_url: string;
  tap_x: number;
  tap_y: number;
  clue: string;
  author_avatar: string;
  author_name: string;
  ts: number;
}

/**
 * The shape stored in Aigram save per user. The platform gives each user
 * exactly ONE save slot per game UUID, so we keep an append-only array of
 * stories inside that slot. New publishes append; nothing gets pruned —
 * users keep their full history on the wall. If publish rate needs throttling
 * later, gate it at the publish step (daily quota) not at display time.
 */
export interface StoryArchive {
  stories: StorySave[];
}

const DEMO_AVATAR: Avatar = {
  url: `${import.meta.env.BASE_URL}demo-avatar.svg`,
  name: 'guest',
  isDemo: true,
};

// Sentinel hero appended to the picker. Tapping it routes makeYours through
// inventScenePrompt (LLM-generated fresh archetype) instead of looking up a
// baked one. id is namespaced so it can never collide with a real hero id.
const RANDOM_HERO_ID = '__random__';
const RANDOM_HERO: HeroEntry = {
  id: RANDOM_HERO_ID,
  caption: 'a scene no one has seen yet',
  video_url: '',
};

const PORTRAIT_SIZE = { width: 576, height: 1024 } as const;
const IDENTITY_CONTRACT = 'HARD FULL-VISUAL-IDENTITY CAST MAP. REFERENCE IMAGE OVERRIDES ALL GENERIC CHARACTER WORDS. SUBJECT A MUST keep the exact complete visible identity of the main foreground subject in the reference—not merely its face. Preserve its silhouette, form or species, body proportions, material, head shape, face visibility, covering, mask, costume, colors, patterns and every small accessory. Never reinterpret a covering as clothing over a generic human body. Any face, skin, hair, hands, arms or legs not visible in the reference MUST remain hidden and MUST NOT be invented. ZERO exposed or implied limbs when the reference has none: no hands, arms, sleeves, feet or side appendages. Keep every distinguishing patch, pin, bell and accessory in the same relative location. If hands are absent, stage props beside or against SUBJECT A with clear empty space between them instead of exposing new hands. Do not transfer reference traits to other people, animals or objects. CURRENT SCENE: ';
const PORTRAIT_RECOMPOSE_PROMPT = 'Recompose this exact image as a true 9:16 portrait cinematic frame. Preserve the visible subject identity, scene, pose, colors and lighting. Extend naturally above and below. Do not add text, logos, borders, UI, faces or body parts that are not visible in the reference.';
const PENDING_VIDEO_KEY = 'tap-and-tell-pending-media-video-v1';

// Resume metadata is a recovery aid, never a prerequisite for generation.
// Shared-origin WebViews can deny localStorage or exhaust its quota; those
// failures must not stop an otherwise valid video request from reaching the
// Media Service.
function readPendingVideo(): string | null {
  try {
    return alteruLocalStorage.getItem(PENDING_VIDEO_KEY);
  } catch (error) {
    console.warn('[video] pending task restore unavailable', error);
    return null;
  }
}

function persistPendingVideo(pending: PendingVideo): void {
  try {
    alteruLocalStorage.setItem(PENDING_VIDEO_KEY, JSON.stringify(pending));
  } catch (error) {
    console.warn('[video] pending task persistence unavailable; continuing without resume support', error);
  }
}

function clearPendingVideo(): void {
  try {
    alteruLocalStorage.removeItem(PENDING_VIDEO_KEY);
  } catch (error) {
    console.warn('[video] pending task cleanup unavailable', error);
  }
}

export default function TapAndTell() {
  const genImg = useGenImage();
  const save = useGameSave<StoryArchive>('tap-and-tell');
  const [phase, setPhase] = useState<Phase>('home');
  const [errMsg, setErrMsg] = useState('');
  const [publishState, setPublishState] = useState<'idle' | 'published'>('idle');
  const [wallStartIdx, setWallStartIdx] = useState(0);
  const [imgRetry, setImgRetry] = useState<GenImgRetry | null>(null);
  const [archetypeChosen, setArchetypeChosen] = useState<string | null>(null);
  // When the user took a "continue from here" branch, remember whose
  // story this is a sequel to — so handlePublish can notify the parent.
  const [parentEntry, setParentEntry] = useState<WallEntry | null>(null);
  const events = useGameEvent();
  const wall = useWallEntries();
  // Track the latest archive in a ref so consecutive publishes in the SAME
  // session see each other. useGameSave's savedData state doesn't update on
  // persist, so without this ref a second publish reads the first publish's
  // stale (null) snapshot and overwrites story 1 with just story 2.
  const archiveRef = useRef<StorySave[]>([]);
  useEffect(() => {
    if (save.savedData?.stories) archiveRef.current = save.savedData.stories;
  }, [save.savedData]);

  // Identity ─────────────────────────────────────────────────────────────────
  const [avatar, setAvatar] = useState<Avatar>(DEMO_AVATAR);
  useEffect(() => {
    let cancelled = false;
    void waitForAigramIdentity().then((telegramId) => {
      if (cancelled || !telegramId) return null;
      return callAigramAPI<{ data?: { name?: string; head_url?: string } }>(
        `/note/telegram/user/get/info/by/telegram_id?telegram_id=${encodeURIComponent(telegramId)}`,
        'GET',
      );
    })
      .then(res => {
        if (!res || cancelled) return;
        const head = res?.data?.head_url;
        const name = res?.data?.name;
        if (head) {
          setAvatar({ url: head, name: name || 'you', isDemo: false });
        }
      })
      .catch(() => {
        /* keep demo */
      });
    return () => { cancelled = true; };
  }, []);

  // Hero entries ────────────────────────────────────────────────────────────
  const [heroEntries, setHeroEntries] = useState<HeroEntry[]>(getSeed());
  useEffect(() => {
    loadHeroEntries().then(setHeroEntries);
  }, []);
  // Append the Surprise-me sentinel as the LAST picker entry. Live entries
  // come first so the random card reads as "or one we haven't shown you".
  const heroesForPicker = useMemo(
    () => [...heroEntries, RANDOM_HERO],
    [heroEntries],
  );

  // Story state ─────────────────────────────────────────────────────────────
  const [frameAPrompt, setFrameAPrompt] = useState('');
  const [frameAUrl, setFrameAUrl] = useState('');
  const [tap, setTap] = useState<TapSpot | null>(null);
  const [clue, setClue] = useState('');
  const [beatPlan, setBeatPlan] = useState<BeatPlan | null>(null);
  const [frameBUrl, setFrameBUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoProgress, setVideoProgress] = useState<ProgressInfo>({
    seconds: 0, attempt: 1, maxAttempts: 3, retrying: false,
  });

  // Loading captions cycle
  const [teaser, setTeaser] = useState(pickTeaser());
  useEffect(() => {
    if (phase === 'prep' || phase === 'gen-a' || phase === 'gen-b' || phase === 'gen-video') {
      const t = setInterval(() => setTeaser(pickTeaser()), 4500);
      return () => clearInterval(t);
    }
  }, [phase]);

  const runVideo = useCallback(async (pending: PendingVideo) => {
    setFrameAUrl(pending.frameAUrl);
    setFrameBUrl(pending.frameBUrl);
    setClue(pending.clue);
    setTap(pending.tap);
    setPhase('gen-video');
    setVideoProgress({ seconds: 0, attempt: 1, maxAttempts: 3, retrying: false });
    try {
      const vUrl = await generateVideo({
        image_url: pending.frameAUrl,
        end_image_url: pending.frameBUrl,
        prompt: pending.prompt,
        task_id: pending.taskId,
        onTaskCreated: taskId => persistPendingVideo({ ...pending, taskId }),
      }, info => setVideoProgress(info));
      await preloadVideo(vUrl);
      clearPendingVideo();
      setVideoUrl(vUrl);
      setPhase('play');
    } catch (e) {
      setErrMsg(`Video unavailable — ${e instanceof Error ? e.message : String(e)}`);
      if (e instanceof MediaServiceError && (!e.retryable || e.status === 200)) clearPendingVideo();
      setVideoUrl('');
      setPhase('play');
    }
  }, []);

  useEffect(() => {
    try {
      const raw = readPendingVideo();
      if (!raw) return;
      const pending = JSON.parse(raw) as PendingVideo;
      if (pending.taskId && pending.frameAUrl && pending.frameBUrl && pending.prompt && pending.tap) {
        void runVideo(pending);
      }
    } catch {
      clearPendingVideo();
    }
  }, [runVideo]);

  // ─── Phase actions ────────────────────────────────────────────────────────

  // "Make yours" sends the original avatar directly to the verified edit path.
  // This preserves nonhuman, covered and faceless identities instead of first
  // coercing every reference into a generic photoreal human portrait.
  const makeYours = useCallback(async (hero: HeroEntry) => {
    // Resolve the scene prompt: random sentinel → LLM-invented fresh scene;
    // otherwise → archetype lookup by hero.id (matches because picker and
    // archetype pool share one id space). Caption-based fallback for any
    // future hero that arrives without a matching archetype.
    let prompt: string;
    let labelForLoader: string;
    if (hero.id === RANDOM_HERO_ID) {
      // Show the loader immediately so the LLM round-trip doesn't look like a
      // dead tap. archetypeChosen stays null until invented to show the
      // generic "composing the opening" line, then upgrades.
      setPhase('gen-a');
      setArchetypeChosen(null);
      try {
        const invented = await inventScenePrompt();
        prompt = invented.prompt;
        labelForLoader = invented.caption;
        console.log(`[makeYours] random → invented "${invented.caption}"`);
      } catch (e) {
        // Fall back to a random ARCHETYPE so the user still gets a scene
        // instead of a hard error. Log + carry on.
        const fb = ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
        prompt = fb.prompt;
        labelForLoader = fb.id;
        console.warn('[makeYours] invent failed, falling back to', fb.id, e);
      }
    } else {
      const arch = ARCHETYPES.find(a => a.id === hero.id);
      prompt = arch?.prompt
        ?? `cinematic still of the figure in the scene of ${hero.caption}, ` +
           `atmospheric, photoreal, vertical 9:16 composition`;
      labelForLoader = arch?.id ?? hero.id;
      console.log(`[makeYours] using hero=${hero.id} archetype=${arch?.id ?? '(fallback)'}`);
    }
    setFrameAPrompt(prompt);
    setArchetypeChosen(labelForLoader);

    try {
      const refUrl = avatar.isDemo ? undefined : avatar.url;
      setPhase('gen-a');
      setImgRetry(null);
      const url = await genImageWithRetry(
        genImg,
        { prompt: refUrl ? `${IDENTITY_CONTRACT}${prompt.split('the figure').join('SUBJECT A')}` : prompt, ref_url: refUrl, requestedSize: PORTRAIT_SIZE },
        info => setImgRetry(info),
      );
      // Wait for the browser to fetch + decode the CDN-fresh image BEFORE
      // we mount TapScreen. Without this the user sees a black canvas with
      // the "tap anywhere" hint floating on it while the <img> is still
      // downloading (~0.5-3s on a freshly baked URL).
      await preloadImage(url);
      setFrameAUrl(url);
      setImgRetry(null);
      setPhase('tap');
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErrMsg(`Couldn't compose the opening scene — ${m}`);
      setPhase('error');
    }
  }, [genImg, avatar]);

  // "Remix" — start from a hero entry's Frame A (cheap path, skips photoreal-
  // prep and scene gen). If the entry has no a_url for some reason, fall
  // through to the full Make-yours pipeline using the same hero so the user
  // still ends up in the scene they picked.
  const remixHero = useCallback(async (entry: HeroEntry) => {
    if (!entry.a_url) {
      void makeYours(entry);
      return;
    }
    setPhase('gen-a');
    try {
      const portraitUrl = await genImageWithRetry(genImg, {
        prompt: PORTRAIT_RECOMPOSE_PROMPT, ref_url: entry.a_url, requestedSize: PORTRAIT_SIZE,
      }, info => setImgRetry(info));
      await preloadImage(portraitUrl);
      setFrameAUrl(portraitUrl);
      setFrameAPrompt(`the scene of ${entry.caption}`);
      setPhase('tap');
    } catch (e) {
      setErrMsg(`Couldn't prepare the opening frame — ${e instanceof Error ? e.message : String(e)}`);
      setPhase('error');
    }
  }, [makeYours, genImg]);

  const startWithUpload = useCallback(async (file: File) => {
    setPhase('gen-a');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('https://video-gen-upload.xinghuan-yin.workers.dev', {
        method: 'POST', body: form,
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!json.url) throw new Error(json.error || 'upload failed');
      const portraitUrl = await genImageWithRetry(genImg, {
        prompt: PORTRAIT_RECOMPOSE_PROMPT, ref_url: json.url, requestedSize: PORTRAIT_SIZE,
      }, info => setImgRetry(info));
      setFrameAPrompt('the uploaded photograph');
      await preloadImage(portraitUrl);
      setFrameAUrl(portraitUrl);
      setPhase('tap');
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErrMsg(`Couldn't upload the photo — ${m}`);
      setPhase('error');
    }
  }, [genImg]);

  const handleCanvasTap = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTap({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  }, []);

  const [planLoading, setPlanLoading] = useState(false);
  useEffect(() => {
    if (phase !== 'tap' || !tap) return;
    let cancelled = false;
    setPlanLoading(true);
    planBeat(frameAPrompt, tap, '')
      .then(p => { if (!cancelled) setBeatPlan(p); })
      .catch(() => {
        if (!cancelled) {
          setBeatPlan({
            chips: ['light shifts', 'wind rises', 'shadow falls'],
            next_image_prompt: frameAPrompt + ', mood shifts, weather thickens',
            video_prompt: 'slow cinematic atmosphere shift',
          });
        }
      })
      .finally(() => !cancelled && setPlanLoading(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tap?.x, tap?.y, phase]);

  const handleGo = useCallback(async (cluefromArg?: string) => {
    const finalClue = (cluefromArg ?? '').trim();
    if (!tap && !finalClue) return;
    setClue(finalClue);
    setPhase('gen-b');
    try {
      const finalPlan = await planBeat(frameAPrompt, tap, finalClue);
      setBeatPlan(finalPlan);

      const bUrl = await genImageWithRetry(
        genImg,
        { prompt: finalPlan.next_image_prompt, ref_url: frameAUrl, requestedSize: PORTRAIT_SIZE },
        info => setImgRetry(info),
      );
      // Same reason as Frame A — preload before any UI references this URL.
      // The gen-video loader paints anchors=[frameAUrl, bUrl], so without
      // this the "A → B" anchor strip on the loader has B as a black square
      // until it lazy-loads.
      await preloadImage(bUrl);
      setFrameBUrl(bUrl);
      setImgRetry(null);

      const pending: PendingVideo = {
        frameAUrl, frameBUrl: bUrl, prompt: finalPlan.video_prompt,
        clue: finalClue, tap: tap ?? { x: 0.5, y: 0.5 },
      };
      persistPendingVideo(pending);
      await runVideo(pending);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErrMsg(`Generation failed — ${m}`);
      setPhase('error');
    }
  }, [tap, frameAPrompt, frameAUrl, genImg, runVideo]);

  const reset = useCallback(() => {
    setPhase('home');
    setFrameAPrompt('');
    setFrameAUrl('');
    setTap(null);
    setClue('');
    setBeatPlan(null);
    setFrameBUrl('');
    setVideoUrl('');
    setVideoProgress({ seconds: 0, attempt: 1, maxAttempts: 3, retrying: false });
    setErrMsg('');
    setPublishState('idle');
    setParentEntry(null);
  }, []);

  // Open the swipeable wall view. Refresh data each time we enter.
  const openWall = useCallback((startIndex = 0) => {
    setWallStartIdx(startIndex);
    wall.refresh();
    setPhase('wall');
  }, [wall]);

  // "Continue from here" — start a new beat using the parent story's end frame
  // as our Frame A. (v0.8.2 may add parent_id linkage for a real story tree.)
  const continueFromEntry = useCallback(async (entry: WallEntry) => {
    setPhase('gen-a');
    try {
      const portraitUrl = await genImageWithRetry(genImg, {
        prompt: PORTRAIT_RECOMPOSE_PROMPT, ref_url: entry.b_url, requestedSize: PORTRAIT_SIZE,
      }, info => setImgRetry(info));
      setFrameAUrl(portraitUrl);
      setFrameAPrompt(`continuing from ${entry.author_name || 'someone'}'s story`);
      setTap(null); setClue(''); setBeatPlan(null); setFrameBUrl(''); setVideoUrl('');
      setPublishState('idle'); setParentEntry(entry); setPhase('tap');
    } catch (e) {
      setErrMsg(`Couldn't prepare this continuation — ${e instanceof Error ? e.message : String(e)}`);
      setPhase('error');
    }
  }, [genImg]);

  // Publish current story to Aigram save. APPENDS to the user's existing
  // archive (kept inside the single save slot the platform allows per user
  // per game). Oldest get pruned past MAX_STORIES_PER_USER. Wall view reads
  // the list endpoint, flattens all users' archives.
  const handlePublish = useCallback(() => {
    if (!frameAUrl || !frameBUrl || !videoUrl || !tap) return;
    if (!save.loaded) return; // don't clobber prior archive before it loads
    const story: StorySave = {
      a_url: frameAUrl,
      b_url: frameBUrl,
      video_url: videoUrl,
      tap_x: tap.x,
      tap_y: tap.y,
      clue,
      author_avatar: avatar.url,
      author_name: avatar.name,
      ts: Date.now(),
    };
    const nextStories = [...archiveRef.current, story];
    archiveRef.current = nextStories;        // mutate ref immediately so a follow-up publish in the same session sees it
    save.persist({ stories: nextStories });
    setPublishState('published');
    wall.refresh();
    // Notify the parent author that someone continued their story. Skip
    // self-continuations.
    const parent = parentEntry;
    const selfId = getTelegramId()! || 'self';
    if (parent && parent.user_id && parent.user_id !== selfId) {
      events.trigger('story_continued', {
        actions: [
          {
            type: 'notify',
            target_user_id: parent.user_id,
            image: {
              ref_url: frameBUrl,
              prompt: 'next beat of a Tap & Tell story, continuation frame',
            },
            message: {
              template: '{sender_name} continued your story.',
              variables: ['sender_name'],
            },
          },
        ],
      });
    }
    setParentEntry(null);
  }, [frameAUrl, frameBUrl, videoUrl, tap, clue, avatar, save, wall, parentEntry, events]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="tt">
      <div className="tt__header">
        <div className="tt__brand-bar">
          <AlteruEmblem size={18} uColor="#F5B1C7" starColor="#FFFFFF" />
          <span className="tt__game-name">TAP &amp; TELL</span>
          <span className="tt__game-edition">VERTICAL</span>
        </div>
        <div className="tt__phase-tag">{phaseLabel(phase)}</div>
      </div>

      {phase === 'home' && (
        <HomeScreen
          avatar={avatar}
          heroEntries={heroesForPicker}
          onMakeYours={makeYours}
          onUpload={startWithUpload}
          onRemix={remixHero}
          onOpenWall={() => openWall(0)}
          wallCount={wall.entries.length}
          wallAvatars={wall.entries.slice(0, 3).map(e => e.author_avatar).filter(Boolean)}
        />
      )}

      {phase === 'prep' && (
        <LoaderScreen
          caption={imgRetry?.retrying ? t('loader.busy.caption') : teaser}
          meta={
            imgRetry?.retrying
              ? t('loader.meta.imgRetry', { seconds: imgRetry.secondsLeft ?? 0, attempt: imgRetry.attempt, max: imgRetry.maxAttempts })
              : t('loader.meta.prep')
          }
          anchors={[avatar.url]}
        />
      )}

      {phase === 'gen-a' && (
        <LoaderScreen
          caption={imgRetry?.retrying ? t('loader.busy.caption') : teaser}
          meta={
            imgRetry?.retrying
              ? t('loader.meta.imgRetry', { seconds: imgRetry.secondsLeft ?? 0, attempt: imgRetry.attempt, max: imgRetry.maxAttempts })
              : (archetypeChosen
                ? t('loader.meta.gen-a.scene', { scene: archetypeChosen })
                : t('loader.meta.gen-a'))
          }
        />
      )}

      {phase === 'tap' && (
        <TapScreen
          imageUrl={frameAUrl}
          tap={tap}
          plan={beatPlan}
          planLoading={planLoading}
          onCanvasTap={handleCanvasTap}
          onGo={handleGo}
        />
      )}

      {phase === 'gen-b' && (
        <LoaderScreen
          caption={imgRetry?.retrying ? t('loader.busy.caption') : teaser}
          meta={
            imgRetry?.retrying
              ? t('loader.meta.imgRetry', { seconds: imgRetry.secondsLeft ?? 0, attempt: imgRetry.attempt, max: imgRetry.maxAttempts })
              : t('loader.meta.gen-b')
          }
          anchors={[frameAUrl]}
        />
      )}

      {phase === 'gen-video' && (
        <LoaderScreen
          caption={videoProgress.retrying ? 'the cloud blinked. trying again…' : teaser}
          meta={
            videoProgress.retrying
              ? t('loader.meta.retry', {
                  seconds: 30 - videoProgress.seconds,
                  attempt: videoProgress.attempt,
                  max: videoProgress.maxAttempts,
                })
              : videoProgress.attempt > 1
                ? t('loader.meta.gen-video.attempt', { seconds: videoProgress.seconds, attempt: videoProgress.attempt })
                : t('loader.meta.gen-video', { seconds: videoProgress.seconds })
          }
          anchors={[frameAUrl, frameBUrl]}
        />
      )}

      {phase === 'play' && (
        <PlayScreen
          videoUrl={videoUrl}
          posterUrl={frameBUrl || frameAUrl}
          onAgain={reset}
          onPublish={handlePublish}
          published={publishState === 'published'}
          canPublish={isInAigramNow() && !!videoUrl}
        />
      )}

      {phase === 'wall' && (
        <WallScreen
          entries={wall.entries}
          loaded={wall.loaded}
          startIndex={wallStartIdx}
          onClose={() => setPhase('home')}
          onContinueFrom={continueFromEntry}
        />
      )}

      {phase === 'error' && (
        <div className="tt-error">
          <div className="tt-error__motif">
            <AlteruEmblem uColor="#FFFFFF" starColor="#FFFFFF" size={220} />
          </div>
          <div className="tt-error__title">A pause<br/>in the story.</div>
          <div className="tt-error__msg">{errMsg}</div>
          <button className="tt-btn tt-btn--primary" onPointerDown={reset}>{t('error.cta.startOver')}</button>
        </div>
      )}

    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

export function phaseLabel(p: Phase): string {
  return t(`phase.${p}`);
}

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6"/>
  </svg>
);

// 4-point sparkle used as the "Surprise me" thumb glyph. Inline SVG, not emoji
// (see feedback_no_emoji_in_ui.md — system emoji glyphs render per-OS).
const SparkleIcon = ({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M12 2 L13.6 9.4 L21 11 L13.6 12.6 L12 20 L10.4 12.6 L3 11 L10.4 9.4 Z" />
  </svg>
);

export function HomeScreen({
  avatar,
  heroEntries,
  onMakeYours,
  onUpload,
  onRemix,
  onOpenWall,
  wallCount = 0,
  wallAvatars = [],
}: {
  avatar: Avatar;
  heroEntries: HeroEntry[];
  onMakeYours: (hero: HeroEntry) => void;
  onUpload: (f: File) => void;
  onRemix: (e: HeroEntry) => void;
  onOpenWall?: () => void;
  wallCount?: number;
  wallAvatars?: string[];
}) {
  const [heroIdx, setHeroIdx] = useState(0);

  // Clamp selection if heroEntries shrinks (e.g. seed → loaded). The previous
  // auto-rotation has been retired: the rotation was racing user taps — the
  // visible scene could change between render and pointerdown, sending the
  // player into a different scene from the one they aimed at. Selection is
  // now fully under user control via the thumb rail below.
  useEffect(() => {
    if (heroIdx >= heroEntries.length) setHeroIdx(0);
  }, [heroEntries.length, heroIdx]);

  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = railRef.current?.querySelector<HTMLElement>(
      `[data-thumb-idx="${heroIdx}"]`,
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [heroIdx]);

  const hero = heroEntries[heroIdx] ?? heroEntries[0];
  const isRandom = hero?.id === '__random__';

  return (
    <div className="tt-home">
      <div
        className={`tt-hero${isRandom ? ' tt-hero--random' : ''}`}
        onClick={() => hero && onRemix(hero)}
      >
        {hero && !isRandom && (
          hero.video_url
            ? (
              <video
                src={hero.video_url}
                poster={hero.a_url}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                key={hero.id}
              />
            )
            : hero.a_url
              ? <img src={hero.a_url} alt="" key={hero.id} />
              : null
        )}
        {isRandom && (
          <div className="tt-hero__random-card">
            <SparkleIcon size={64} />
            <span>surprise me</span>
          </div>
        )}
        <div className="tt-hero__overlay" />
        <div className="tt-hero__avatar">
          <img src={avatar.url} alt="" />
        </div>
        {hero && (
          <div className="tt-hero__chip">
            <em>{hero.caption}</em>
            <span>{isRandom ? t('home.hero.random') : t('home.hero.remix')}</span>
          </div>
        )}
      </div>

      {heroEntries.length > 1 && (
        <div className="tt-thumb-rail" ref={railRef} role="tablist" aria-label="pick a scene">
          {heroEntries.map((e, i) => {
            const thumbIsRandom = e.id === '__random__';
            return (
              <button
                key={e.id}
                type="button"
                role="tab"
                aria-selected={i === heroIdx}
                aria-label={e.caption}
                data-thumb-idx={i}
                className={
                  `tt-thumb` +
                  (i === heroIdx ? ' tt-thumb--selected' : '') +
                  (thumbIsRandom ? ' tt-thumb--random' : '')
                }
                onClick={() => setHeroIdx(i)}
              >
                {thumbIsRandom
                  ? <span className="tt-thumb__sparkle"><SparkleIcon size={22} /></span>
                  : e.a_url
                    ? <img src={e.a_url} alt="" />
                    : <video src={e.video_url} muted playsInline preload="metadata" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="tt-pitch">
        <h1 className="tt-pitch__headline">Tell what happens next.</h1>
        <p className="tt-pitch__sub">{t('home.pitch.sub')}</p>
      </div>

      <div className="tt-cta">
        <button
          className="tt-cta__primary"
          onPointerDown={() => hero && onMakeYours(hero)}
          disabled={!hero}
        >
          Make yours <ArrowIcon />
        </button>
        <div className="tt-cta__avatar-pill">
          <img src={avatar.url} alt="" />
          <span>{avatar.isDemo ? t('home.cta.avatarPill.demo') : t('home.cta.avatarPill.playing')}</span>
          <em>{avatar.name}</em>
        </div>
        <div className="tt-cta__upload">
          <label>
            {t('home.cta.upload')}
            <input
              type="file"
              accept="image/*"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
          </label>
        </div>
      </div>

      {onOpenWall && (
        <button className="tt-wall-cta" onClick={onOpenWall}>
          {wallAvatars && wallAvatars.length > 0 && (
            <span className="tt-wall-cta__stack">
              {wallAvatars.map((u, i) => (
                <img key={i} src={u} alt="" style={{ zIndex: wallAvatars.length - i }} />
              ))}
            </span>
          )}
          <span className="tt-wall-cta__text">
            {wallCount > 0
              ? t('home.wall.seeAll', { n: wallCount })
              : t('home.wall.beFirst')}
          </span>
          <span className="tt-wall-cta__arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6"/>
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}

export function LoaderScreen({
  caption,
  meta,
  anchors,
}: {
  caption: string;
  meta: string;
  anchors?: string[];
}) {
  return (
    <div className="tt-loader">
      <div className="tt-loader__motif">
        <AlteruEmblem uColor="#FFFFFF" starColor="#FFFFFF" size={300} />
      </div>
      {anchors && anchors.length > 0 && (
        <div className="tt-loader__anchors">
          {anchors.flatMap((u, i) => {
            const elems = [<img key={`a-${i}`} src={u} alt="" />];
            if (i < anchors.length - 1) elems.push(<span key={`s-${i}`}>→</span>);
            return elems;
          })}
        </div>
      )}
      <img className="tt-loader__svg" src={`${import.meta.env.BASE_URL}loader.svg`} alt="loading" />
      <div className="tt-loader__caption">{caption}</div>
      <div className="tt-loader__meta">{meta}</div>
    </div>
  );
}

export function TapScreen({
  imageUrl,
  tap,
  plan,
  planLoading,
  onCanvasTap,
  onGo,
}: {
  imageUrl: string;
  tap: TapSpot | null;
  plan: BeatPlan | null;
  planLoading: boolean;
  onCanvasTap: (e: React.PointerEvent<HTMLDivElement>) => void;
  onGo: (clue: string) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [customClue, setCustomClue] = useState('');
  const chips = plan?.chips ?? [];

  return (
    <div className="tt-tap">
      <div className="tt-canvas" ref={canvasRef} onPointerDown={onCanvasTap}>
        <img src={imageUrl} alt="" />
        {tap && (
          <div
            className="tt-ripple"
            style={{ left: `${tap.x * 100}%`, top: `${tap.y * 100}%` }}
          >
            <i />
          </div>
        )}
        {!tap && <div className="tt-tap__hint">{t('tap.hint')}</div>}
      </div>

      {tap && (
        <div className="tt-prompt">
          <div className="tt-prompt__question">what happens here?</div>

          {planLoading || chips.length === 0
            ? [0, 1, 2].map(i => (
                <div key={i} className="tt-chip-card tt-chip-card--loading">
                  listening to the frame…
                </div>
              ))
            : chips.map(c => (
                <button
                  key={c}
                  className="tt-chip-card"
                  onPointerDown={() => onGo(c)}
                >
                  <span>{c}</span>
                  <span className="tt-chip-card__arrow">→</span>
                </button>
              ))}

          <div className="tt-or">{t('tap.or')}</div>

          <div className="tt-custom-row">
            <input
              className="tt-input"
              value={customClue}
              onChange={e => setCustomClue(e.target.value.slice(0, 60))}
              placeholder={t('tap.input.placeholder')}
              maxLength={60}
            />
            <button
              className="tt-go"
              onPointerDown={() => onGo(customClue)}
              disabled={!customClue.trim()}
            >
              GO
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PlayScreen({
  videoUrl,
  posterUrl,
  onAgain,
  onPublish,
  published = false,
  canPublish = true,
}: {
  videoUrl: string;
  posterUrl?: string;
  onAgain: () => void;
  onPublish?: () => void;
  published?: boolean;
  canPublish?: boolean;
}) {
  return (
    <div className="tt-play">
      <div className="tt-play__caption">your story.</div>
      <div className="tt-play__video">
        {/* poster = the opening frame (frame A). Without it the video tag
            shows the container's #000 background during the ~100-300ms
            between mount and first-frame decode — a black flash even
            though the MP4 bytes are already cached by our preloadVideo. */}
        {videoUrl
          ? <video src={videoUrl} poster={posterUrl} controls autoPlay loop playsInline />
          : posterUrl ? <img src={posterUrl} alt="" /> : null}
      </div>
      <div className="tt-play__cta">
        {canPublish && onPublish && (
          <button
            className={`tt-btn ${published ? 'tt-btn--published' : 'tt-btn--pink'}`}
            onPointerDown={published ? undefined : onPublish}
            disabled={published}
          >
            {published ? t('play.cta.published') : t('play.cta.publish')}
          </button>
        )}
        {videoUrl && <a className="tt-btn" href={videoUrl} target="_blank" rel="noopener noreferrer" download>
          {t('play.cta.download')}
        </a>}
        <button className="tt-btn tt-btn--primary" onPointerDown={onAgain}>
          tell another
        </button>
      </div>
    </div>
  );
}
