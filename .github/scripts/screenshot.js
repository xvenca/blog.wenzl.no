const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const BASE = 'http://127.0.0.1:1313';
const OUT  = path.join(__dirname, '../../screenshots');
fs.mkdirSync(OUT, { recursive: true });

function fetchText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
}

function toLocal(absUrl) {
  return absUrl.replace(/^https?:\/\/[^/]+/, BASE);
}

function urlToName(absUrl) {
  const parts = new URL(absUrl).pathname.replace(/^\/|\/$/g, '').split('/').filter(Boolean);
  return parts.length === 0 ? 'home' : parts.join('-');
}

async function collectUrls() {
  const indexXml = await fetchText(`${BASE}/sitemap.xml`);

  if (indexXml.includes('<sitemapindex')) {
    // multilingual: sitemap index → fetch each child
    const urls = [];
    for (const childUrl of extractLocs(indexXml)) {
      const xml = await fetchText(toLocal(childUrl));
      urls.push(...extractLocs(xml));
    }
    return [...new Set(urls)];
  }

  // single sitemap (fallback)
  return extractLocs(indexXml);
}

(async () => {
  const pageUrls = await collectUrls();
  console.log(`Screenshotting ${pageUrls.length} pages...`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

  let ok = 0, fail = 0;
  for (const url of pageUrls) {
    const name = urlToName(url);
    const page = await ctx.newPage();
    try {
      await page.goto(toLocal(url), { waitUntil: 'networkidle', timeout: 15000 });
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
      console.log(`✓ ${name}`);
      ok++;
    } catch (e) {
      console.error(`✗ ${name}: ${e.message}`);
      fail++;
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log(`\nDone: ${ok} ok, ${fail} failed`);
  if (fail > 0) process.exit(1);
})();
