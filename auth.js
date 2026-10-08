"use strict";

require("dotenv").config();

const { firefox } = require("playwright");

const STORAGE_STATE =
  process.env.FACEBOOK_STORAGE_STATE || "facebook-storage-state.json";

async function authenticate() {
  const browser = await firefox.launch({
    headless: false,
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("https://www.facebook.com/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    console.log("");
    console.log("Log in to Facebook in the browser window.");
    console.log("Complete any normal authentication steps.");
    console.log("");
    console.log("Press Enter in this terminal when you are finished.");

    await new Promise((resolve) => {
      process.stdin.once("data", resolve);
    });

    await context.storageState({
      path: STORAGE_STATE,
    });

    console.log(`Saved browser session to ${STORAGE_STATE}`);
  } finally {
    await browser.close();
  }
}

authenticate().catch((error) => {
  console.error("Authentication setup failed:", error);
  process.exitCode = 1;
});
