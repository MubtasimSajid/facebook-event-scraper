const EARTH_RADIUS_KM = 6371;

function normalizeEventLink(link) {
  if (!link) return null;
  try {
    const url = new URL(link, 'https://www.facebook.com');
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function parseEventStartDate(rawDateText) {
  if (!rawDateText || typeof rawDateText !== 'string') return null;
  const firstSegment = rawDateText
    .replace(/^starts on\s+/i, '')
    .split(/\s[–-]\s/)[0]
    .trim();

  const parsed = new Date(firstSegment);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function isUpcoming(date, now = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  return date.getTime() > now.getTime();
}

function haversineDistanceKm(fromLat, fromLon, toLat, toLon) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const dLat = toRadians(toLat - fromLat);
  const dLon = toRadians(toLon - fromLon);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function dedupeEvents(events) {
  const seen = new Set();
  const deduped = [];

  for (const event of events) {
    const normalizedLink = normalizeEventLink(event.link);
    if (!normalizedLink || seen.has(normalizedLink)) continue;
    seen.add(normalizedLink);
    deduped.push({ ...event, link: normalizedLink });
  }

  return deduped;
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const distanceA = Number.isFinite(a.distanceKm) ? a.distanceKm : Number.POSITIVE_INFINITY;
    const distanceB = Number.isFinite(b.distanceKm) ? b.distanceKm : Number.POSITIVE_INFINITY;

    if (distanceA !== distanceB) return distanceA - distanceB;

    return a.startDate.getTime() - b.startDate.getTime();
  });
}

module.exports = {
  dedupeEvents,
  haversineDistanceKm,
  isUpcoming,
  normalizeEventLink,
  parseEventStartDate,
  sortEvents,
};
