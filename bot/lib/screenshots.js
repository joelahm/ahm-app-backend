// Lightweight per-page hero screenshots (above-the-fold) for embedding in
// the report PDF. Separate from lib/vision.js's full-page captures — those
// are passed to Claude vision for layout review.

const puppeteer = require('puppeteer');

let browser = null;

async function getBrowser() {
  if (browser) {
    try { if (browser.process() && !browser.process().killed && browser.connected !== false) return browser; }
    catch {}
    browser = null;
  }
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'],
    protocolTimeout: 60 * 1000,
  });
  browser.on('disconnected', () => { browser = null; });
  return browser;
}

async function closeBrowser() {
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
  }
}

/**
 * Capture an above-the-fold hero screenshot of a URL.
 * Returns a base64 JPEG, suitable for embedding in HTML via data: URL.
 *
 * @param {string} url
 * @param {object} options
 *   @param {'desktop'|'mobile'} viewport
 *   @param {number} quality 1-100 (default 65)
 */
async function captureHero(url, { viewport = 'desktop', quality = 65 } = {}) {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    if (viewport === 'mobile') {
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
    } else {
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
    }
    page.setDefaultNavigationTimeout(45 * 1000);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45 * 1000 }).catch(async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25 * 1000 }).catch(() => {});
    });
    // Allow lazy-load images / animations to settle
    await new Promise((r) => setTimeout(r, 700));
    await page.evaluate(() => window.scrollTo(0, 0));
    const buf = await page.screenshot({ type: 'jpeg', quality, fullPage: false, encoding: 'base64' });
    return buf;
  } catch (err) {
    return null;
  } finally {
    try { await page.close(); } catch {}
  }
}

module.exports = { captureHero, closeBrowser };
