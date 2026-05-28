/**
 * Capture demo screenshots in both EN and ZH locales.
 * Run: node qa_capture.cjs (after `npm run preview`)
 */
const puppeteer = require(require.resolve('puppeteer', {
  paths: ['/Users/yin/code/games/mugshot-booth/node_modules'],
}));
const path = require('path');
const fs = require('fs');

const BASE = process.env.TT_URL || 'http://localhost:4174/tap-and-tell-vertical/?demo=all';
const OUT = path.resolve(__dirname, '_qa');

async function capture(browser, lang, file) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });
  const url = `${BASE}&lang=${lang}`;
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  const fullHeight = await page.evaluate(() => {
    const demo = document.querySelector('.demo');
    return demo ? demo.scrollHeight : document.documentElement.scrollHeight;
  });
  await page.setViewport({ width: 1600, height: fullHeight + 40, deviceScaleFactor: 2 });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[${lang}] saved: ${file} (h=${fullHeight})`);
  await page.close();
}

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new' });
  await capture(browser, 'en', path.join(OUT, 'demo-en.png'));
  await capture(browser, 'zh', path.join(OUT, 'demo-zh.png'));
  await browser.close();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
