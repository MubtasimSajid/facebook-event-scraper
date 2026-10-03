require('dotenv').config();

const fs = require('fs');
const nodemailer = require('nodemailer');
const { firefox } = require('playwright');
const {
  dedupeEvents,
  haversineDistanceKm,
  isUpcoming,
  parseEventStartDate,
  sortEvents,
} = require('./digest-utils');

const TECH_KEYWORDS = [
  'programming contest',
  'competitive programming',
  'coding contest',
  'hackathon',
  'datathon',
  'icpc',
  'robotics competition',
  'artificial intelligence',
  'machine learning',
  'cybersecurity',
  'software competition',
  'informatics olympiad',
  'algorithm competition',
  'technology competition',
];

const AUTH_BLOCK_PATTERNS = [/\/login/i, /checkpoint/i, /captcha/i, /suspicious/i, /reauth/i, /two_factor/i];

function getConfig() {
  return {
    emailTo: process.env.EMAIL_TO,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    storageStatePath: process.env.FACEBOOK_STORAGE_STATE_PATH || 'facebook-storage-state.json',
    dhakaLatitude: Number(process.env.DHAKA_LATITUDE || 23.8103),
    dhakaLongitude: Number(process.env.DHAKA_LONGITUDE || 90.4125),
    searchRadiusKm: Number(process.env.SEARCH_RADIUS_KM || 500),
    maxEventsInEmail: Number(process.env.MAX_EVENTS_IN_EMAIL || 25),
  };
}

function validateConfig(config) {
  const missing = [];
  for (const key of ['emailTo', 'smtpHost', 'smtpUser', 'smtpPassword']) {
    if (!config[key]) missing.push(key);
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTechnicalEvent(text) {
  const haystack = (text || '').toLowerCase();
  return TECH_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

async function extractJsonLdEvent(page) {
  return page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent || 'null');
        const records = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.['@graph'])
            ? parsed['@graph']
            : [parsed];

        for (const record of records) {
          const type = Array.isArray(record?.['@type']) ? record['@type'].join(',') : record?.['@type'];
          if (!type || !String(type).toLowerCase().includes('event')) continue;

          return {
            title: record.name || null,
            startDateRaw: record.startDate || null,
            location:
              record.location?.name ||
              record.location?.address?.streetAddress ||
              record.location?.address?.addressLocality ||
              null,
            description: record.description || null,
            link: record.url || null,
          };
        }
      } catch {
        continue;
      }
    }

    return null;
  });
}

function hasAuthOrChallengeIssue(url, pageText) {
  if (AUTH_BLOCK_PATTERNS.some((pattern) => pattern.test(url))) return true;
  const text = (pageText || '').toLowerCase();
  return (
    text.includes('security check') ||
    text.includes('suspicious login') ||
    text.includes('enter the code we sent') ||
    text.includes('captcha')
  );
}

async function assertAuthenticated(page) {
  await delay(1500);
  const currentUrl = page.url();
  const text = await page.textContent('body').catch(() => '');
  if (hasAuthOrChallengeIssue(currentUrl, text)) {
    throw new Error('Authentication challenge detected (login/checkpoint/captcha).');
  }
}

async function collectEventLinks(page, maxLinks = 60) {
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 1500);
    await delay(1200);
  }

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/events/"]'))
      .map((anchor) => anchor.href)
      .filter((href) => href.includes('/events/'));
  });

  return [...new Set(links)].slice(0, maxLinks);
}

async function geocodeInBangladesh(locationText) {
  if (!locationText) return null;
  const query = encodeURIComponent(`${locationText}, Bangladesh`);
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=bd&q=${query}`,
    {
      headers: {
        'User-Agent': 'facebook-event-digest/1.0',
      },
    },
  );

  if (!response.ok) return null;
  const payload = await response.json();
  if (!Array.isArray(payload) || payload.length === 0) return null;

  const point = payload[0];
  return {
    lat: Number(point.lat),
    lon: Number(point.lon),
  };
}

function buildDigestBody(events) {
  if (events.length === 0) {
    return 'No matching upcoming public events were found this week.';
  }

  return events
    .map((event) => {
      const distanceText = Number.isFinite(event.distanceKm)
        ? `${event.distanceKm.toFixed(1)} km`
        : 'Unknown';

      return [
        `Event title: ${event.title}`,
        `Event date & time: ${event.startDate.toISOString()}`,
        `Event location: ${event.location || 'Unknown'}`,
        `Approximate distance from Dhaka: ${distanceText}`,
        `Facebook event link: ${event.link}`,
      ].join('\n');
    })
    .join('\n\n');
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
    throw new Error(`Storage state file not found at ${config.storageStatePath}.`);
  }

  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({ storageState: config.storageStatePath });
  const page = await context.newPage();

  try {
    const discoveredLinks = new Set();

    for (const keyword of TECH_KEYWORDS) {
      const searchUrl = `https://www.facebook.com/events/search/?q=${encodeURIComponent(`${keyword} Bangladesh`)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await assertAuthenticated(page);
      const links = await collectEventLinks(page);
      links.forEach((link) => discoveredLinks.add(link));
      await delay(1500);
    }

    const collectedEvents = [];

    for (const link of discoveredLinks) {
      try {
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await assertAuthenticated(page);
        const event = await extractJsonLdEvent(page);
        if (!event || !event.title || !event.startDateRaw) {
          await delay(800);
          continue;
        }

        const startDate = parseEventStartDate(event.startDateRaw);
        if (!isUpcoming(startDate)) {
          await delay(800);
          continue;
        }

        const keywordText = `${event.title || ''} ${event.description || ''}`;
        if (!isTechnicalEvent(keywordText)) {
          await delay(800);
          continue;
        }

        let distanceKm;
        const coordinates = await geocodeInBangladesh(event.location);
        if (coordinates?.lat && coordinates?.lon) {
          distanceKm = haversineDistanceKm(
            config.dhakaLatitude,
            config.dhakaLongitude,
            coordinates.lat,
            coordinates.lon,
          );

          if (distanceKm > config.searchRadiusKm) {
            await delay(800);
            continue;
          }
        }

        collectedEvents.push({
          title: event.title,
          startDate,
          location: event.location,
          distanceKm,
          link: event.link || link,
        });

        await delay(1000);
      } catch {
        await delay(800);
      }
    }

    const finalEvents = sortEvents(dedupeEvents(collectedEvents)).slice(0, config.maxEventsInEmail);
    const body = buildDigestBody(finalEvents);

    await sendEmail(
      config,
      `Facebook Event Digest - ${new Date().toISOString().slice(0, 10)}`,
      body,
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch(async (error) => {
  const config = getConfig();

  if (config.smtpHost && config.smtpUser && config.smtpPassword && config.emailTo) {
    try {
      await sendEmail(
        config,
        `Facebook Event Digest Error - ${new Date().toISOString().slice(0, 10)}`,
        `The scraper stopped because of an error:\n\n${error.message}`,
      );
    } catch {
      // ignore secondary email errors
    }
  }

  process.exitCode = 1;
});
