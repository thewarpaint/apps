// Renders each app's icons/icon.svg into the PNG sizes the manifests and
// iOS need. Run from the repo root after editing an icon.svg:
//   node tools/build-icons.js
// Needs Playwright with Chromium installed. Afterwards bump CACHE_NAME in sw.js.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['icons', 'smoking-log/icons', 'fridge-tracker/icons', 'coloring/icons'];
const SIZES = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const dir of DIRS) {
    const svg = fs.readFileSync(path.join(ROOT, dir, 'icon.svg'), 'utf8');
    for (const [name, size] of Object.entries(SIZES)) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
      );
      await page.screenshot({ path: path.join(ROOT, dir, name), omitBackground: false });
      console.log('wrote', path.join(dir, name));
    }
  }
  await browser.close();
})();
