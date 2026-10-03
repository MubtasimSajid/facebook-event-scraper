require('dotenv').config();

const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const { firefox } = require('playwright');

const storageStatePath = process.env.FACEBOOK_STORAGE_STATE_PATH || 'facebook-storage-state.json';

function looksUnauthenticated(url, pageText) {
  if (/\/login/i.test(url)) return true;
  const text = (pageText || '').toLowerCase();
  return (
    text.includes('log into facebook') ||
    text.includes('security check') ||
    text.includes('suspicious login') ||
    text.includes('captcha')
  );
}

(async () => {
  const browser = await firefox.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

  const rl = readline.createInterface({ input, output });
  await rl.question('Log in manually in the opened browser, then press Enter here to save session state... ');
  rl.close();

  const pageText = await page.textContent('body').catch(() => '');
  if (looksUnauthenticated(page.url(), pageText)) {
    throw new Error('Login is incomplete or blocked by checkpoint/captcha. Session state not saved.');
  }

  await context.storageState({ path: storageStatePath });
  await browser.close();
})();
