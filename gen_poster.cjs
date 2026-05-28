/**
 * Generate poster.png 1024×1024 for Tap & Tell.
 * Cabin scene (from spike) cropped + dark top gradient + AlterU emblem +
 * "TAP & TELL" Cormorant italic title at top + small pitch line.
 *
 * Run: node gen_poster.cjs → writes public/poster.png + games/posters/tap-and-tell.png
 */
const puppeteer = require('/Users/yin/code/games/mugshot-booth/node_modules/puppeteer');
const path = require('path');
const fs = require('fs');

const OUT_GAME = path.resolve(__dirname, 'public/poster.png');
const OUT_LIST = '/Users/yin/code/games/games/posters/tap-and-tell-vertical.png';

const CABIN = 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779827243649029.webp';

const HTML = `<!doctype html><html><head><meta charset=utf-8>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700&family=Cormorant+Garamond:ital,wght@0,500;1,500;1,700&display=swap">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #000; }
  .poster {
    width: 1024px; height: 1024px;
    position: relative;
    overflow: hidden;
    background: #000;
  }
  .scene {
    position: absolute; inset: 0;
    background: url('${CABIN}') center center / cover;
  }
  .top-grad {
    position: absolute; inset: 0;
    background: linear-gradient(180deg,
      rgba(0,0,0,0.85) 0%,
      rgba(0,0,0,0.65) 30%,
      rgba(0,0,0,0.0) 55%,
      rgba(0,0,0,0.0) 100%);
    pointer-events: none;
  }
  .title-area {
    position: absolute;
    top: 0; left: 0; right: 0;
    padding: 64px 72px 0;
    color: #fff;
    z-index: 2;
  }
  .brand {
    display: flex; align-items: center; gap: 14px;
    margin-bottom: 28px;
  }
  .brand svg {
    width: 38px; height: 87px;
  }
  .brand-tag {
    font-family: 'Inter', sans-serif;
    font-weight: 700;
    font-size: 17px;
    letter-spacing: 0.26em;
    color: #F4F1EA;
  }
  .title {
    font-family: 'Cormorant Garamond', serif;
    font-style: italic;
    font-weight: 500;
    font-size: 138px;
    line-height: 0.92;
    letter-spacing: 0.01em;
    color: #F4F1EA;
    text-shadow: 0 2px 16px rgba(0,0,0,0.4);
  }
  .pitch {
    font-family: 'Cormorant Garamond', serif;
    font-style: italic;
    font-weight: 500;
    font-size: 34px;
    color: #F5B1C7;
    margin-top: 18px;
    letter-spacing: 0.01em;
  }
</style>
</head>
<body>
  <div class="poster">
    <div class="scene"></div>
    <div class="top-grad"></div>
    <div class="title-area">
      <div class="brand">
        <svg viewBox="0 0 97.0667 222" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M85.0468 68.6857C89.8931 68.3372 93.1601 70.8457 94.9883 75.1302C98.6203 83.5735 93.4398 86.9838 89.5821 93.3247C77.9259 112.479 79.5696 137.557 77.8107 158.582C75.9991 180.258 68.5583 210.583 46.3359 219.923C39.0406 222.988 28.5835 222.371 21.4632 219.012C-15.6796 200.926 7.19538 148.103 19.5915 121.264C23.4016 114.097 27.0469 106.783 31.9739 100.277C35.5577 95.5468 41.815 92.7229 47.065 96.8266C49.4531 98.6931 50.5612 102.683 49.6297 105.517C47.5796 111.752 43.1715 117.174 40.2032 123.016C31.2711 139.71 21.6362 161.576 22.2161 180.736C22.7145 185.729 24.5092 191.949 28.7759 195.162C35.784 200.439 43.3127 197.445 47.6794 190.771C53.3557 182.09 55.4449 172.866 56.4973 162.854C57.6501 152.683 57.591 142.863 58.1069 132.61C59.061 113.735 60.1607 91.9709 72.4792 76.4435C75.5759 72.5381 79.9722 69.2317 85.0468 68.6857Z" fill="#F5B1C7"/>
          <path d="M0.9778 43.8507C1.66381 43.0206 2.31973 42.329 3.03937 41.5413C5.31662 40.4695 12.7384 44.4894 18.9151 42.7177C28.9927 39.8249 38.2824 32.6224 47.9961 20.5881C51.419 16.3468 53.9412 11.9203 57.5971 7.88917C58.93 7.20648 58.3415 7.31748 59.3472 7.73996C59.4751 8.38569 59.7135 9.08634 59.0406 10.1179C43.7743 33.5145 38.8284 51.0487 49.9265 61.3953C51.6277 62.9839 54.427 64.5373 55.9992 66.4603L54.3007 68.9972C53.518 69.6665 53.2092 70.0958 52.532 69.9077C47.8591 68.6124 43.9165 67.3595 38.5515 67.406C28.2983 67.4898 19.0238 79.2193 9.98352 91.8257C7.91465 94.7105 4.31936 100.469 1.95892 102.692C0.317895 103.246 0.904134 103.355 0 102.646C0.208833 99.6478 4.75251 93.295 6.6601 89.9653C17.7953 70.5314 17.2515 55.3282 8.06088 49.1118C6.50746 48.067 1.52931 46.022 0.9778 43.8507Z" fill="#FFFFFF"/>
        </svg>
        <span class="brand-tag">ON ALTERU</span>
      </div>
      <div class="title">Tap &amp; Tell<br/>&middot; Vertical</div>
      <div class="pitch">tell what happens next.</div>
    </div>
  </div>
</body></html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
  await page.setContent(HTML, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: OUT_GAME, fullPage: false });
  console.log('saved:', OUT_GAME);
  // also copy to games repo
  fs.copyFileSync(OUT_GAME, OUT_LIST);
  console.log('saved:', OUT_LIST);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
