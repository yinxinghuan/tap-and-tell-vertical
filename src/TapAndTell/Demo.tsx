// All-phases showcase — visit ?demo=all to see every screen on one page.

import { HomeScreen, LoaderScreen, TapScreen, PlayScreen } from './TapAndTell';
import AlteruEmblem from './components/AlteruEmblem';
import './TapAndTell.less';
import './Demo.less';

const FRAME_A = 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779827243649029.webp';
const FRAME_B = 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779859812186600.webp';
const VIDEO = 'https://cdn.aiwaves.tech/prodsv/telegram/video/123456/20260527-133040.mp4';

const DEMO_AVATAR = {
  url: `${import.meta.env.BASE_URL}demo-avatar.svg`,
  name: 'guest',
  isDemo: true,
};

const HERO_ENTRIES = [
  { id: 'cabin', caption: 'a cabin warms in winter', video_url: VIDEO, a_url: FRAME_A, b_url: FRAME_B },
  { id: 'beach', caption: 'low tide on a quiet shore', video_url: VIDEO, a_url: FRAME_A },
  { id: 'alley', caption: 'an alley meets the rain', video_url: VIDEO, a_url: FRAME_A },
  { id: 'greenhouse', caption: 'morning in the greenhouse', video_url: VIDEO, a_url: FRAME_A },
  { id: 'desert', caption: 'the desert holds its breath', video_url: VIDEO, a_url: FRAME_A },
];

const MOCK_PLAN = {
  chips: ['snow thickens', 'a light flicks on', 'smoke rises from the chimney'],
  next_image_prompt: '...',
  video_prompt: '...',
};

const MOCK_TAP = { x: 0.5, y: 0.45 };

const FRAMES: Array<{
  id: string;
  label: string;
  caption: string;
  render: () => JSX.Element;
}> = [
  {
    id: 'home',
    label: '1 · home',
    caption: 'Hero loop + Make yours + wall',
    render: () => (
      <HomeScreen
        avatar={DEMO_AVATAR}
        heroEntries={HERO_ENTRIES}
        onMakeYours={() => {}}
        onUpload={() => {}}
        onRemix={() => {}}
      />
    ),
  },
  {
    id: 'gen-a',
    label: '2 · gen-a',
    caption: 'Composing the opening',
    render: () => (
      <LoaderScreen
        caption="somewhere in the frame, something shifts…"
        meta="composing · ~3 min"
      />
    ),
  },
  {
    id: 'tap-empty',
    label: '3a · tap (pre)',
    caption: 'Frame A · "tap somewhere" hint',
    render: () => (
      <TapScreen
        imageUrl={FRAME_A}
        tap={null}
        plan={null}
        planLoading={false}
        onCanvasTap={() => {}}
        onGo={() => {}}
      />
    ),
  },
  {
    id: 'tap-active',
    label: '3b · tap (after)',
    caption: 'Ripple + chip-card stack',
    render: () => (
      <TapScreen
        imageUrl={FRAME_A}
        tap={MOCK_TAP}
        plan={MOCK_PLAN}
        planLoading={false}
        onCanvasTap={() => {}}
        onGo={() => {}}
      />
    ),
  },
  {
    id: 'gen-b',
    label: '4 · gen-b',
    caption: 'Imagining the end frame',
    render: () => (
      <LoaderScreen
        caption="the camera holds its breath…"
        meta="imagining what happens next · ~3 min"
        anchors={[FRAME_A]}
      />
    ),
  },
  {
    id: 'gen-video',
    label: '5 · gen-video',
    caption: 'A pink → B white · weaving',
    render: () => (
      <LoaderScreen
        caption="a single drop of light begins to move…"
        meta="weaving the motion · 42s"
        anchors={[FRAME_A, FRAME_B]}
      />
    ),
  },
  {
    id: 'play',
    label: '6 · play',
    caption: '5-sec result + CTAs',
    render: () => <PlayScreen videoUrl={VIDEO} onAgain={() => {}} />,
  },
  {
    id: 'error',
    label: 'e · error',
    caption: 'Gentle failure',
    render: () => (
      <div className="tt-error">
        <div className="tt-error__motif">
          <AlteruEmblem uColor="#FFFFFF" starColor="#FFFFFF" size={220} />
        </div>
        <div className="tt-error__title">A pause<br/>in the story.</div>
        <div className="tt-error__msg">
          Generation failed — video gen API returned HTTP 500.
        </div>
        <button className="tt-btn tt-btn--primary">start over</button>
      </div>
    ),
  },
];

export default function Demo() {
  return (
    <div className="demo">
      <header className="demo__header">
        <div className="demo__title">
          <AlteruEmblem size={32} uColor="#F5B1C7" starColor="#FFFFFF" />
          <span>Tap &amp; Tell · Vertical — v2.0 (3:4 portrait · sheet overlay)</span>
        </div>
        <div className="demo__hint">
          Bolder type · curl motif echoes · generous whitespace · loose AlterU echo
        </div>
      </header>
      <div className="demo__grid">
        {FRAMES.map(f => (
          <div key={f.id} className="demo__cell">
            <div className="demo__label">
              <span className="demo__label-num">{f.label}</span>
              <span className="demo__label-cap">{f.caption}</span>
            </div>
            <div className="demo__phone">
              <div className="demo__notch" />
              <div className="tt tt--demo">
                <div className="tt__header">
                  <div className="tt__brand-bar">
                    <AlteruEmblem size={18} uColor="#F5B1C7" starColor="#FFFFFF" />
                    <span className="tt__game-name">TAP &amp; TELL</span>
                  </div>
                  <div className="tt__phase-tag">{f.id}</div>
                </div>
                {f.render()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
