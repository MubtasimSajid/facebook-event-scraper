"use strict";

require("dotenv").config();

const nodemailer = require("nodemailer");
const { firefox } = require("playwright");

const SEARCH_KEYWORDS = [
  "Programming Contest",
  "Competitive Programming",
  "Coding Contest",
  "Hackathon",
  "Datathon",
  "ICPC",
  "Robotics Competition",
  "Artificial Intelligence",
  "Machine Learning",
  "Cybersecurity",
  "Software Competition",
  "Informatics Olympiad",
  "Algorithm Competition",
  "Technology Competition",
];

const CONFIG = {
  storageState:
    process.env.FACEBOOK_STORAGE_STATE || "facebook-storage-state.json",
  recipient: process.env.EMAIL_TO,
  maxEventsInEmail: Number(process.env.MAX_EVENTS_IN_EMAIL || 100),

  delays: {
    beforeSearch: [1000, 2500],
    afterSearch: [1000, 2500],
    betweenSearches: [1500, 3500],
    afterScroll: [900, 1800],
  },

  scrolling: {
    minScrolls: 3,
    maxScrolls: 6,
    minDistance: 900,
    maxDistance: 1800,
  },
};

function validateConfig() {
  const required = [
    "EMAIL_TO",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  if (
    !Number.isInteger(CONFIG.maxEventsInEmail) ||
    CONFIG.maxEventsInEmail < 1
  ) {
    throw new Error("MAX_EVENTS_IN_EMAIL must be a positive integer.");
  }
}

function randomInt(min, max) {
  if (min > max) {
    throw new Error(`Invalid random range: ${min} > ${max}`);
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function randomDelay([min, max]) {
  await delay(randomInt(min, max));
}

function normalizeEventUrl(url) {
  try {
    const parsed = new URL(url);

    parsed.search = "";
    parsed.hash = "";

    return parsed.toString();
  } catch {
    return null;
  }
}

function deduplicateEvents(events) {
  const seen = new Set();
  const result = [];

  for (const event of events) {
    const link = normalizeEventUrl(event.link);

    if (!link || seen.has(link)) {
      continue;
    }

    seen.add(link);

    result.push({
      name: event.name?.trim() || "Facebook Event",
      link,
    });
  }

  return result;
}

function buildSearchUrl(keyword) {
  const searchTerm = `${keyword} Bangladesh`;

  return (
    "https://www.facebook.com/events/search/?q=" +
    encodeURIComponent(searchTerm)
  );
}

async function assertAuthenticated(page) {
  const url = page.url();

  const authenticationRequired =
    /\/login|\/checkpoint|\/recover|\/security/i.test(url);

  if (authenticationRequired) {
    throw new Error(`Facebook authentication is required. Current URL: ${url}`);
  }

  await page.waitForTimeout(1000);

  const title = await page.title();

  if (/log in|login/i.test(title)) {
    throw new Error("Facebook authentication appears to have expired.");
  }
}

async function collectEventsFromSearchResults(page) {
  const scrollCount = randomInt(
    CONFIG.scrolling.minScrolls,
    CONFIG.scrolling.maxScrolls,
  );

  for (let i = 0; i < scrollCount; i += 1) {
    const distance = randomInt(
      CONFIG.scrolling.minDistance,
      CONFIG.scrolling.maxDistance,
    );

    await page.mouse.wheel(0, distance);
    await randomDelay(CONFIG.delays.afterScroll);
  }

  await randomDelay(CONFIG.delays.afterSearch);

  return page.evaluate(() => {
    function cleanText(value) {
      return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function isEventUrl(href) {
      try {
        const url = new URL(href, window.location.origin);

        return /^\/events\/\d+/i.test(url.pathname);
      } catch {
        return false;
      }
    }

    function getName(anchor) {
      const ariaLabel = cleanText(anchor.getAttribute("aria-label"));
      const title = cleanText(anchor.getAttribute("title"));
      const text = cleanText(anchor.innerText || anchor.textContent);

      return ariaLabel || title || text;
    }

    const events = [];

    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = anchor.href;

      if (!isEventUrl(href)) {
        continue;
      }

      const name = getName(anchor);

      if (!name) {
        continue;
      }

      events.push({
        name,
        link: href,
      });
    }

    return events;
  });
}

function buildDigestBody(events) {
  if (events.length === 0) {
    return [
      "No Facebook events were found.",
      "",
      "The scraper completed successfully but did not find any matching events.",
    ].join("\n");
  }

  const lines = [
    `Found ${events.length} Facebook event${events.length === 1 ? "" : "s"}:`,
    "",
  ];

  events.forEach((event, index) => {
    lines.push(`${index + 1}. ${event.name}`);
    lines.push(`   ${event.link}`);
    lines.push("");
  });

  return lines.join("\n").trim();
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendDigest(events) {
  const transporter = createTransporter();

  const limitedEvents = events.slice(0, CONFIG.maxEventsInEmail);

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: CONFIG.recipient,
    subject: `Facebook Event Digest — ${limitedEvents.length} event${
      limitedEvents.length === 1 ? "" : "s"
    }`,
    text: buildDigestBody(limitedEvents),
  });
}

async function scrape() {
  validateConfig();

  const browser = await firefox.launch({
    headless: true,
  });

  try {
    const context = await browser.newContext({
      storageState: CONFIG.storageState,
    });

    const page = await context.newPage();

    const keywords = shuffle(SEARCH_KEYWORDS);
    const discoveredEvents = [];

    console.log(`Searching ${keywords.length} keywords...`);

    for (const keyword of keywords) {
      const searchTerm = `${keyword} Bangladesh`;

      console.log(`Searching: ${searchTerm}`);

      await page.goto(buildSearchUrl(keyword), {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });

      await assertAuthenticated(page);
      await randomDelay(CONFIG.delays.beforeSearch);

      const events = await collectEventsFromSearchResults(page);

      console.log(`Found ${events.length} result(s).`);

      discoveredEvents.push(...events);

      await randomDelay(CONFIG.delays.betweenSearches);
    }

    const events = deduplicateEvents(discoveredEvents);

    console.log(`Collected ${events.length} unique event(s).`);

    await sendDigest(events);

    console.log("Digest email sent successfully.");
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  scrape().catch((error) => {
    console.error("Scraper failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  randomInt,
  shuffle,
  normalizeEventUrl,
  deduplicateEvents,
  buildSearchUrl,
};
