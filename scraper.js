require("dotenv").config();

const fs = require("fs");
const nodemailer = require("nodemailer");
const { firefox } = require("playwright");

const SEARCH_KEYWORDS = [
  "programming contest",
  "competitive programming",
  "coding contest",
  "hackathon",
  "datathon",
  "icpc",
  "robotics competition",
  "artificial intelligence",
  "machine learning",
  "cybersecurity",
  "software competition",
  "informatics olympiad",
  "algorithm competition",
  "technology competition",
];

function getConfig() {
  return {
    emailTo: process.env.EMAIL_TO,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    storageStatePath:
      process.env.FACEBOOK_STORAGE_STATE_PATH || "facebook-storage-state.json",
  };
}

function validateConfig(config) {
  const missing = [];

  for (const key of ["emailTo", "smtpHost", "smtpUser", "smtpPassword"]) {
    if (!config[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEventLink(link) {
  if (!link) {
    return null;
  }

  try {
    const url = new URL(link, "https://www.facebook.com");

    url.hash = "";
    url.search = "";

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function cleanEventName(name) {
  if (!name) {
    return null;
  }

  const cleaned = String(name)
    .replace(/^profile photo of\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return null;
  }

  const genericNames = new Set([
    "events",
    "event",
    "see more",
    "learn more",
    "interested",
    "going",
    "share",
    "facebook",
  ]);

  if (genericNames.has(cleaned.toLowerCase())) {
    return null;
  }

  return cleaned;
}

function hasAuthOrChallengeIssue(url, pageTitle) {
  const currentUrl = url || "";
  const normalizedTitle = (pageTitle || "").toLowerCase();

  if (/\/(login|checkpoint|recover)(\/|$|\?)/i.test(currentUrl)) {
    return true;
  }

  return (
    normalizedTitle.includes("security check") ||
    normalizedTitle.includes("suspicious login") ||
    normalizedTitle.includes("code verification") ||
    normalizedTitle.includes("captcha")
  );
}

async function assertAuthenticated(page) {
  await delay(1500);

  const currentUrl = page.url();
  const pageTitle = await page.title().catch(() => "");

  console.log(`Facebook page URL: ${currentUrl}`);
  console.log(`Facebook page title: ${pageTitle}`);

  if (hasAuthOrChallengeIssue(currentUrl, pageTitle)) {
    throw new Error(
      "Authentication challenge detected (login/checkpoint/captcha).",
    );
  }
}

async function collectEventsFromSearchResults(page) {
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 1500);
    await delay(1200);
  }

  const events = await page.evaluate(() => {
    function cleanText(value) {
      return value ? value.replace(/\s+/g, " ").trim() : "";
    }

    function isEventDetailUrl(href) {
      try {
        const url = new URL(href, window.location.origin);

        return /^\/events\/\d+/i.test(url.pathname);
      } catch {
        return false;
      }
    }

    function normalizeCandidate(name) {
      return String(name || "")
        .replace(/^profile photo of\s+/i, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getCandidateName(anchor) {
      const ariaLabel = cleanText(anchor.getAttribute("aria-label"));
      const titleAttribute = cleanText(anchor.getAttribute("title"));
      const anchorText = cleanText(anchor.innerText || anchor.textContent);

      return normalizeCandidate(ariaLabel || titleAttribute || anchorText);
    }

    const results = [];

    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = anchor.href;

      if (!isEventDetailUrl(href)) {
        continue;
      }

      let name = getCandidateName(anchor);

      if (!name) {
        const parent = anchor.parentElement;

        if (parent) {
          name = normalizeCandidate(
            cleanText(parent.innerText || parent.textContent),
          );
        }
      }

      if (!name) {
        continue;
      }

      const genericNames = new Set([
        "events",
        "event",
        "see more",
        "learn more",
        "interested",
        "going",
        "share",
        "facebook",
      ]);

      if (genericNames.has(name.toLowerCase())) {
        continue;
      }

      results.push({
        name,
        link: href,
      });
    }

    return results;
  });

  return events;
}

function dedupeEvents(events) {
  const seen = new Set();
  const deduped = [];

  for (const event of events) {
    const link = normalizeEventLink(event.link);
    const name = cleanEventName(event.name);

    if (!link || !name || seen.has(link)) {
      continue;
    }

    seen.add(link);

    deduped.push({
      name,
      link,
    });
  }

  return deduped;
}

function buildDigestBody(events) {
  if (events.length === 0) {
    return "No events were found in the Facebook search results this week.";
  }

  return [
    `Found ${events.length} Facebook event${events.length === 1 ? "" : "s"}:`,
    "",
    ...events.flatMap((event, index) => [
      `${index + 1}. ${event.name}`,
      event.link,
      "",
    ]),
  ].join("\n");
}

async function sendEmail(config, subject, body) {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPassword,
    },
  });

  await transporter.sendMail({
    from: config.smtpUser,
    to: config.emailTo,
    subject,
    text: body,
  });
}

async function run() {
  const config = getConfig();

  validateConfig(config);

  if (!fs.existsSync(config.storageStatePath)) {
    throw new Error(
      `Storage state file not found at ${config.storageStatePath}.`,
    );
  }

  const browser = await firefox.launch({
    headless: true,
  });

  const context = await browser.newContext({
    storageState: config.storageStatePath,
  });

  const page = await context.newPage();

  try {
    const discoveredEvents = [];

    for (const keyword of SEARCH_KEYWORDS) {
      const searchTerm = `${keyword} Bangladesh`;

      const searchUrl =
        `https://www.facebook.com/events/search/?q=` +
        `${encodeURIComponent(searchTerm)}`;

      console.log(`Searching Facebook for: ${searchTerm}`);

      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      await assertAuthenticated(page);

      const events = await collectEventsFromSearchResults(page);

      console.log(`Found ${events.length} event link(s) for "${searchTerm}".`);

      discoveredEvents.push(...events);

      await delay(1500);
    }

    const finalEvents = dedupeEvents(discoveredEvents);

    console.log(`Total unique events found: ${finalEvents.length}`);

    const body = buildDigestBody(finalEvents);

    await sendEmail(
      config,
      `Facebook Event Digest - ${new Date().toISOString().slice(0, 10)}`,
      body,
    );

    console.log("Digest email sent successfully.");
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch(async (error) => {
  const config = getConfig();

  if (
    config.smtpHost &&
    config.smtpUser &&
    config.smtpPassword &&
    config.emailTo
  ) {
    try {
      await sendEmail(
        config,
        `Facebook Event Digest Error - ${new Date()
          .toISOString()
          .slice(0, 10)}`,
        `The scraper stopped because of an error:\n\n${error.message}`,
      );
    } catch {
      // Ignore secondary email errors.
    }
  }

  console.error(error.message);
  process.exitCode = 1;
});
