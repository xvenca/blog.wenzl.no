const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const BASE = 'http://127.0.0.1:1313';
const OUT = path.join(__dirname, '../../og-screenshots');
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

function extractOgTags(html) {
  const get = prop => {
    const re1 = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i');
    const m = re1.exec(html) || re2.exec(html);
    return m ? m[1].trim() : '';
  };
  return {
    title:       get('og:title'),
    description: get('og:description'),
    image:       get('og:image'),
    url:         get('og:url'),
    siteName:    get('og:site_name'),
  };
}

async function collectUrls() {
  const indexXml = await fetchText(`${BASE}/sitemap.xml`);
  if (indexXml.includes('<sitemapindex')) {
    const urls = [];
    for (const childUrl of extractLocs(indexXml)) {
      const xml = await fetchText(toLocal(childUrl));
      urls.push(...extractLocs(xml));
    }
    return [...new Set(urls)];
  }
  return extractLocs(indexXml);
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeCardHtml(og, pageUrl) {
  const domain = escHtml((og.siteName || new URL(og.url || pageUrl).hostname).toUpperCase());
  const imgSrc  = og.image ? escHtml(toLocal(og.image)) : '';
  const title   = escHtml(og.title       || '(no og:title)');
  const desc    = escHtml(og.description || '(no og:description)');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #f0f2f5;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.card {
  width: 500px;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #dadde1;
  box-shadow: 0 1px 2px rgba(0,0,0,.15);
}
.img-wrap { width: 100%; height: 261px; background: #e4e6ea; overflow: hidden; }
.img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
.body { padding: 12px; border-top: 1px solid #e4e6ea; }
.domain { font-size: 12px; color: #65676b; text-transform: uppercase; margin-bottom: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title  { font-size: 16px; font-weight: 600; color: #050505; line-height: 1.3; margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.desc   { font-size: 14px; color: #65676b; line-height: 1.38; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
</style>
</head>
<body>
<div class="card">
  <div class="img-wrap">${imgSrc ? `<img src="${imgSrc}">` : ''}</div>
  <div class="body">
    <div class="domain">${domain}</div>
    <div class="title">${title}</div>
    <div class="desc">${desc}</div>
  </div>
</div>
</body>
</html>`;
}

(async () => {
  const pageUrls = await collectUrls();
  console.log(`Generating OG preview cards for ${pageUrls.length} pages...`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 600, height: 500 }, deviceScaleFactor: 2 });

  let ok = 0, fail = 0;
  for (const url of pageUrls) {
    const name = urlToName(url);
    const page = await ctx.newPage();
    try {
      const html = await fetchText(toLocal(url));
      const og   = extractOgTags(html);
      await page.setContent(makeCardHtml(og, url), { waitUntil: 'networkidle', timeout: 10000 });
      const card = await page.$('.card');
      await card.screenshot({ path: path.join(OUT, `${name}.png`) });
      console.log(`✓ ${name}: "${og.title}"`);
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
