require('dotenv').config();

const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const { firefox } = require('playwright');

const storageStatePath = process.env.FACEBOOK_STORAGE_STATE_PATH || 'facebook-storage-state.json';

function looksUnauthenticated(url, pageTitle) {
  if (/\/(login|checkpoint|recover)(\/|$|\?)/i.test(url || '')) return true;

  const title = (pageTitle || '').toLowerCase();
  return (
    title.includes('security check') ||
    title.includes('suspicious login') ||
    title.includes('code verification') ||
    title.includes('captcha')
  );
}

async function runAuth() {
  let browser;
  let context;
  let rl;

  try {
    browser = await firefox.launch({ headless: false });
    context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    rl = readline.createInterface({ input, output });
    await rl.question('Log in manually in the opened browser, then press Enter here to save session state... ');

    const finalUrl = page.url();
    const finalTitle = await page.title().catch(() => '');
    console.log(`Final page URL: ${finalUrl}`);
    console.log(`Final page title: ${finalTitle}`);

    if (looksUnauthenticated(finalUrl, finalTitle)) {
      throw new Error('Login is incomplete or blocked by checkpoint/captcha. Session state not saved.');
    }

    await context.storageState({ path: storageStatePath });
  } finally {
    if (rl) rl.close();
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

if (require.main === module) {
  runAuth().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { looksUnauthenticated, runAuth };
