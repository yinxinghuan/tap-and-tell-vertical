// TikTok-style swipeable wall view. Each card is a full-screen Frame A still
// with the original tap-marker (pulsing pink dot) at the author's tap coords.
// Tap the dot → video plays in place. When video ends → "Tell what happens
// next" CTA (v0.8.2 will wire this to continue mechanic).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WallEntry } from '../utils/useWallEntries';
import { t } from '../i18n';

export default function WallScreen({
  entries,
  loaded,
  startIndex = 0,
  onClose,
  onContinueFrom,
}: {
  entries: WallEntry[];
  loaded: boolean;
  startIndex?: number;
  onClose: () => void;
  onContinueFrom?: (entry: WallEntry) => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Snap to startIndex on mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el || entries.length === 0) return;
    el.scrollTo({ top: startIndex * el.clientHeight, behavior: 'instant' as ScrollBehavior });
  }, [entries.length, startIndex]);

  // Track active card via scroll
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const newIdx = Math.round(el.scrollTop / el.clientHeight);
    if (newIdx !== idx) setIdx(newIdx);
  }, [idx]);

  if (!loaded) {
    return (
      <div className="tt-wall-view tt-wall-view--empty">
        <div className="tt-wall-view__msg">{t('wall.loading')}</div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="tt-wall-view tt-wall-view--empty">
        <button className="tt-wall-view__close" onPointerDown={onClose} aria-label="close">×</button>
        <div className="tt-wall-view__msg">{t('wall.empty')}</div>
        <button className="tt-btn tt-btn--pink" onPointerDown={onClose}>
          {t('wall.empty.cta')}
        </button>
      </div>
    );
  }

  return (
    <div className="tt-wall-view">
      <button className="tt-wall-view__close" onPointerDown={onClose} aria-label="close">
        <CloseIcon />
      </button>
      <div
        className="tt-wall-view__feed"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {entries.map((e, i) => (
          <WallCard
            key={`${e.user_id}-${e.ts}`}
            entry={e}
            active={i === idx}
            onContinue={() => onContinueFrom?.(e)}
          />
        ))}
      </div>
      {entries.length > 1 && idx < entries.length - 1 && (
        <div className="tt-wall-view__hint">
          <SwipeIcon />
          <span>{t('wall.swipe')}</span>
        </div>
      )}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function SwipeIcon() {
  // Two stacked chevrons hinting "scroll for next"
  return (
    <svg viewBox="0 0 16 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7l5 5 5-5" opacity="0.5" />
      <path d="M3 14l5 5 5-5" />
    </svg>
  );
}

function WallCard({
  entry,
  active,
  onContinue,
}: {
  entry: WallEntry;
  active: boolean;
  onContinue: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Reset when card leaves the viewport
  useEffect(() => {
    if (!active) {
      setPlaying(false);
      setEnded(false);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [active]);

  const triggerPlay = useCallback(() => {
    setPlaying(true);
    setEnded(false);
    // Defer so React mounts video first
    setTimeout(() => {
      const v = videoRef.current;
      if (v) {
        v.currentTime = 0;
        void v.play().catch(() => {});
      }
    }, 0);
  }, []);

  return (
    <div className="tt-wall-card">
      {!playing && (
        <>
          <img src={entry.a_url} alt="" className="tt-wall-card__still" />
          <div className="tt-wall-card__gradient" />
          <div
            className="tt-wall-card__marker"
            style={{
              left: `${entry.tap_x * 100}%`,
              top: `${entry.tap_y * 100}%`,
            }}
            onPointerDown={triggerPlay}
            role="button"
            aria-label="play"
          >
            <i />
          </div>
        </>
      )}
      {playing && (
        <video
          ref={videoRef}
          src={entry.video_url}
          className="tt-wall-card__video"
          playsInline
          onEnded={() => setEnded(true)}
        />
      )}

      <div className="tt-wall-card__author">
        {entry.author_avatar && (
          <img src={entry.author_avatar} alt="" />
        )}
        <span>{entry.author_name || 'someone'}</span>
      </div>

      {entry.clue && !playing && (
        <div className="tt-wall-card__clue">"{entry.clue}"</div>
      )}

      {ended && (
        <div className="tt-wall-card__cta">
          <button className="tt-btn tt-btn--pink" onPointerDown={onContinue}>
            {t('wall.continue')}
          </button>
        </div>
      )}
    </div>
  );
}
