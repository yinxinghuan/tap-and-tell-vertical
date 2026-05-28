// Minimal i18n — en (default) + zh.
//
// Convention (from games CLAUDE.md):
//   - localStorage `game_locale` override wins
//   - else navigator.language startsWith('zh') → zh
//   - else → en
//   - Test ZH: `localStorage.setItem('game_locale', 'zh'); location.reload()`
//
// What stays English regardless of locale:
//   The BIG decorative Cormorant Garamond italic headlines — they're part of
//   the brand voice ("Tell what happens next.", "what happens here?", "your
//   story.", "A pause in the story.", "Make yours", etc). These are NOT
//   piped through t(); they're hard-coded literals in the JSX.
//
// What gets translated:
//   Functional UI — labels, pills, small buttons, meta strings, placeholders.

type Locale = 'en' | 'zh';

const DICT: Record<Locale, Record<string, string>> = {
  en: {
    // Header phase tags
    'phase.home':      'home',
    'phase.prep':      'translating',
    'phase.gen-a':     'composing',
    'phase.tap':       'your turn',
    'phase.gen-b':     'imagining',
    'phase.gen-video': 'weaving',
    'phase.play':      'the result',
    'phase.error':     'paused',

    // Home
    'home.hero.remix':         '· tap to remix',
    'home.pitch.sub':          'a 5-second AI continuation, from any frame',
    'home.cta.avatarPill.demo':    'demo as',
    'home.cta.avatarPill.playing': 'playing as',
    'home.cta.upload':          'or upload a photo',
    'home.wall.label':          'recent stories',
    'home.wall.seeAll':         '{n} stories from the community',
    'home.wall.beFirst':        'be the first to publish',

    // Tap
    'tap.hint':                 'tap somewhere…',
    'tap.or':                   'or',
    'tap.input.placeholder':    'in your own words…',

    // Loader meta
    'loader.meta.prep':         'translating you into the frame · ~3 min',
    'loader.meta.gen-a':        'composing the opening · ~3 min',
    'loader.meta.imgRetry':     'image service is busy · retrying in {seconds}s · attempt {attempt} of {max}',
    'loader.busy.caption':      'the cloud is catching its breath…',
    'loader.meta.gen-b':        'imagining what happens next · ~3 min',
    'loader.meta.gen-video':    'weaving the motion · {seconds}s',
    'loader.meta.gen-video.attempt': 'weaving the motion · {seconds}s · attempt {attempt}',
    'loader.meta.retry':        'retrying in {seconds}s · attempt {attempt} of {max}',

    // Play
    'play.cta.download':        'download',
    'play.cta.publish':         'publish to wall',
    'play.cta.published':       'on the wall ✓',

    // Error
    'error.cta.startOver':      'start over',

    // Wall
    'wall.loading':             'loading the wall…',
    'wall.empty':               'no stories on the wall yet.',
    'wall.empty.cta':           'tell the first one →',
    'wall.swipe':               'swipe for the next',
    'wall.continue':            'tell what happens after this →',
    'wall.tap-to-play':         'tap to play',

    // Archetype labels (rarely seen — when picker shown)
    'archetype.cabin':       'A cabin in the snow',
    'archetype.beach':       'A figure on an empty beach',
    'archetype.street':      'An empty city street at night',
    'archetype.desert':      'A road through the desert',
  },
  zh: {
    // Header phase tags
    'phase.home':      '首页',
    'phase.prep':      '翻译形象',
    'phase.gen-a':     '正在画',
    'phase.tap':       '你的回合',
    'phase.gen-b':     '正在想象',
    'phase.gen-video': '正在串成',
    'phase.play':      '完成',
    'phase.error':     '暂停',

    // Home
    'home.hero.remix':         '· 点这里重新讲一遍',
    'home.pitch.sub':          '5 秒 AI 续片，从任意一帧开始',
    'home.cta.avatarPill.demo':    '试玩中',
    'home.cta.avatarPill.playing': '正在玩的是',
    'home.cta.upload':          '或上传一张照片',
    'home.wall.label':          '最近的故事',
    'home.wall.seeAll':         '社区里 {n} 个故事',
    'home.wall.beFirst':        '成为第一个发布的人',

    // Tap
    'tap.hint':                 '点画面任意一处…',
    'tap.or':                   '或',
    'tap.input.placeholder':    '用你自己的话说…',

    // Loader meta
    'loader.meta.prep':         '正在把你画进画面 · 约 3 分钟',
    'loader.meta.gen-a':        '正在画开场 · 约 3 分钟',
    'loader.meta.imgRetry':     '图片服务繁忙 · {seconds} 秒后重试 · 第 {attempt}/{max} 次',
    'loader.busy.caption':      '云端在喘口气…',
    'loader.meta.gen-b':        '正在想象接下来 · 约 3 分钟',
    'loader.meta.gen-video':    '正在串成画面 · {seconds} 秒',
    'loader.meta.gen-video.attempt': '正在串成画面 · {seconds} 秒 · 第 {attempt} 次尝试',
    'loader.meta.retry':        '{seconds} 秒后重试 · 第 {attempt}/{max} 次',

    // Play
    'play.cta.download':        '下载',
    'play.cta.publish':         '发布到墙',
    'play.cta.published':       '已上墙 ✓',

    // Error
    'error.cta.startOver':      '重新开始',

    // Wall
    'wall.loading':             '加载墙上的故事…',
    'wall.empty':               '墙上还没有故事。',
    'wall.empty.cta':           '讲第一个 →',
    'wall.swipe':               '上滑看下一个',
    'wall.continue':            '接下来呢？ →',
    'wall.tap-to-play':         '点击播放',

    // Archetype labels
    'archetype.cabin':       '雪林中的小木屋',
    'archetype.beach':       '空旷海滩上的人',
    'archetype.street':      '深夜空荡的小巷',
    'archetype.desert':      '沙漠中的公路',
  },
};

function detect(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const override = localStorage.getItem('game_locale');
    if (override === 'zh' || override === 'en') return override;
  } catch {
    /* private mode etc */
  }
  // ?lang=zh override (for previews / share links)
  const qLang = new URLSearchParams(window.location.search).get('lang');
  if (qLang === 'zh' || qLang === 'en') return qLang as Locale;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export const locale: Locale = detect();

export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = DICT[locale];
  let s = dict[key] ?? DICT.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}
