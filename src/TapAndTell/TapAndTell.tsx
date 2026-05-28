// Tap & Tell — main orchestrator + all phases. AlterU-branded v0.2.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGenImage, callAigramAPI, telegramId, isInAigram } from '@shared/runtime';
import { useGameSave } from '@shared/save';
import { generateVideo, type ProgressInfo } from './utils/videoApi';
import { planBeat, pickTeaser, type BeatPlan } from './utils/aiHelpers';
import { ARCHETYPES, PHOTOREAL_PREP_PROMPT } from './utils/prompts';
import { loadHeroEntries, getSeed, type HeroEntry } from './utils/heroData';
import { getPhotoreal, setPhotoreal } from './utils/photorealCache';
import { genImageWithRetry, type RetryProgress as GenImgRetry } from './utils/genImageWithRetry';
import AlteruEmblem from './components/AlteruEmblem';
import WallScreen from './screens/WallScreen';
import { useWallEntries, type WallEntry } from './utils/useWallEntries';
import { t } from './i18n';
import './TapAndTell.less';

type Phase = 'home' | 'prep' | 'gen-a' | 'tap' | 'gen-b' | 'gen-video' | 'play' | 'error' | 'wall';

interface TapSpot { x: number; y: number; }
interface Avatar { url: string; name: string; isDemo: boolean; }

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

export default function TapAndTell() {
  const genImg = useGenImage();
  const save = useGameSave<StoryArchive>('tap-and-tell');
  const [phase, setPhase] = useState<Phase>('home');
  const [errMsg, setErrMsg] = useState('');
  const [publishState, setPublishState] = useState<'idle' | 'published'>('idle');
  const [wallStartIdx, setWallStartIdx] = useState(0);
  const [imgRetry, setImgRetry] = useState<GenImgRetry | null>(null);
  const wall = useWallEntries();

  // Identity ─────────────────────────────────────────────────────────────────
  const [avatar, setAvatar] = useState<Avatar>(DEMO_AVATAR);
  useEffect(() => {
    if (!isInAigram || !telegramId) return;
    callAigramAPI<{ data?: { name?: string; head_url?: string } }>(
      `/note/telegram/user/get/info/by/telegram_id?telegram_id=${encodeURIComponent(telegramId)}`,
      'GET',
    )
      .then(res => {
        const head = res?.data?.head_url;
        const name = res?.data?.name;
        if (head) {
          setAvatar({ url: head, name: name || 'you', isDemo: false });
        }
      })
      .catch(() => {
        /* keep demo */
      });
  }, []);

  // Hero entries ────────────────────────────────────────────────────────────
  const [heroEntries, setHeroEntries] = useState<HeroEntry[]>(getSeed());
  useEffect(() => {
    loadHeroEntries().then(setHeroEntries);
  }, []);

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

  // ─── Phase actions ────────────────────────────────────────────────────────

  // "Make yours" — two-step pipeline:
  //   1) Photoreal-prep: img2img the avatar with a "realistic portrait" prompt
  //      to translate stylized AI avatars into photoreal intermediates. Cached
  //      per avatar URL — first run ~200s, subsequent runs 0s.
  //   2) Scene gen: img2img with the photoreal intermediate + scene prompt.
  // Demo avatar (geometric svg) skips step 1 and falls back to plain txt2img.
  const makeYours = useCallback(async () => {
    const arch = ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
    setFrameAPrompt(arch.prompt);

    try {
      // Step 1: ensure we have a photoreal intermediate (only for real avatars)
      let refUrl: string | undefined;
      if (!avatar.isDemo) {
        const cached = getPhotoreal(avatar.url);
        if (cached) {
          refUrl = cached;
        } else {
          setPhase('prep');
          refUrl = await genImageWithRetry(
            genImg,
            { prompt: PHOTOREAL_PREP_PROMPT, ref_url: avatar.url },
            info => setImgRetry(info),
          );
          setPhotoreal(avatar.url, refUrl);
        }
      }

      // Step 2: scene gen
      setPhase('gen-a');
      setImgRetry(null);
      const url = await genImageWithRetry(
        genImg,
        { prompt: arch.prompt, ref_url: refUrl },
        info => setImgRetry(info),
      );
      setFrameAUrl(url);
      setImgRetry(null);
      setPhase('tap');
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErrMsg(`Couldn't compose the opening scene — ${m}`);
      setPhase('error');
    }
  }, [genImg, avatar]);

  // "Remix" — start from a hero entry's Frame A
  const remixHero = useCallback((entry: HeroEntry) => {
    if (!entry.a_url) {
      void makeYours();
      return;
    }
    setFrameAUrl(entry.a_url);
    setFrameAPrompt(`the scene of ${entry.caption}`);
    setPhase('tap');
  }, [makeYours]);

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
      setFrameAPrompt('the uploaded photograph');
      setFrameAUrl(json.url);
      setPhase('tap');
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErrMsg(`Couldn't upload the photo — ${m}`);
      setPhase('error');
    }
  }, []);

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
        { prompt: finalPlan.next_image_prompt, ref_url: frameAUrl },
        info => setImgRetry(info),
      );
      setFrameBUrl(bUrl);
      setImgRetry(null);

      setPhase('gen-video');
      setVideoProgress({ seconds: 0, attempt: 1, maxAttempts: 3, retrying: false });
      const vUrl = await generateVideo(
        {
          image_url: frameAUrl,
          end_image_url: bUrl,
          prompt: finalPlan.video_prompt,
          env: 'prod',
        },
        (info: ProgressInfo) => setVideoProgress(info),
      );
      setVideoUrl(vUrl);
      setPhase('play');
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErrMsg(`Generation failed — ${m}`);
      setPhase('error');
    }
  }, [tap, frameAPrompt, frameAUrl, genImg]);

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
  }, []);

  // Open the swipeable wall view. Refresh data each time we enter.
  const openWall = useCallback((startIndex = 0) => {
    setWallStartIdx(startIndex);
    wall.refresh();
    setPhase('wall');
  }, [wall]);

  // "Continue from here" — start a new beat using the parent story's end frame
  // as our Frame A. (v0.8.2 may add parent_id linkage for a real story tree.)
  const continueFromEntry = useCallback((entry: WallEntry) => {
    setFrameAUrl(entry.b_url);
    setFrameAPrompt(`continuing from ${entry.author_name || 'someone'}'s story`);
    setTap(null);
    setClue('');
    setBeatPlan(null);
    setFrameBUrl('');
    setVideoUrl('');
    setPublishState('idle');
    setPhase('tap');
  }, []);

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
    const prev = save.savedData?.stories ?? [];
    const nextStories = [...prev, story];
    save.persist({ stories: nextStories });
    setPublishState('published');
    wall.refresh();
  }, [frameAUrl, frameBUrl, videoUrl, tap, clue, avatar, save, wall]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="tt">
      <div className="tt__header">
        <div className="tt__brand-bar">
          <AlteruEmblem size={18} uColor="#F5B1C7" starColor="#FFFFFF" />
          <span className="tt__game-name">TAP &amp; TELL</span>
        </div>
        <div className="tt__phase-tag">{phaseLabel(phase)}</div>
      </div>

      {phase === 'home' && (
        <HomeScreen
          avatar={avatar}
          heroEntries={heroEntries}
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
              : t('loader.meta.gen-a')
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
          onAgain={reset}
          onPublish={handlePublish}
          published={publishState === 'published'}
          canPublish={isInAigram}
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
  onMakeYours: () => void;
  onUpload: (f: File) => void;
  onRemix: (e: HeroEntry) => void;
  onOpenWall?: () => void;
  wallCount?: number;
  wallAvatars?: string[];
}) {
  const [heroIdx, setHeroIdx] = useState(0);
  useEffect(() => {
    if (heroEntries.length <= 1) return;
    const t = setInterval(() => setHeroIdx(i => (i + 1) % heroEntries.length), 7000);
    return () => clearInterval(t);
  }, [heroEntries.length]);

  const hero = heroEntries[heroIdx] ?? heroEntries[0];
  const wallEntries = heroEntries.filter(e => e.id !== hero?.id).slice(0, 4);

  return (
    <div className="tt-home">
      <div className="tt-hero" onPointerDown={() => hero && onRemix(hero)}>
        {hero && (
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
        )}
        <div className="tt-hero__overlay" />
        <div className="tt-hero__avatar">
          <img src={avatar.url} alt="" />
        </div>
        {hero && (
          <div className="tt-hero__chip">
            <em>{hero.caption}</em>
            <span>{t('home.hero.remix')}</span>
          </div>
        )}
      </div>

      <div className="tt-pitch">
        <h1 className="tt-pitch__headline">Tell what happens next.</h1>
        <p className="tt-pitch__sub">{t('home.pitch.sub')}</p>
      </div>

      <div className="tt-cta">
        <button className="tt-cta__primary" onPointerDown={onMakeYours}>
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

      {wallEntries.length > 0 && (
        <div className="tt-wall">
          <div className="tt-wall__label">{t('home.wall.label')}</div>
          <div className="tt-wall__row">
            {wallEntries.map(e => (
              <div
                key={e.id}
                className="tt-wall__cell"
                onPointerDown={() => onRemix(e)}
              >
                <video
                  src={e.video_url}
                  poster={e.a_url}
                  loop muted playsInline autoPlay
                  preload="metadata"
                />
              </div>
            ))}
          </div>
          {onOpenWall && (
            <button className="tt-wall-cta" onPointerDown={onOpenWall}>
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
  onAgain,
  onPublish,
  published = false,
  canPublish = true,
}: {
  videoUrl: string;
  onAgain: () => void;
  onPublish?: () => void;
  published?: boolean;
  canPublish?: boolean;
}) {
  return (
    <div className="tt-play">
      <div className="tt-play__caption">your story.</div>
      <div className="tt-play__video">
        <video src={videoUrl} controls autoPlay loop playsInline />
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
        <a className="tt-btn" href={videoUrl} target="_blank" rel="noopener noreferrer" download>
          {t('play.cta.download')}
        </a>
        <button className="tt-btn tt-btn--primary" onPointerDown={onAgain}>
          tell another
        </button>
      </div>
    </div>
  );
}
