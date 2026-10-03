const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dedupeEvents,
  haversineDistanceKm,
  isUpcoming,
  normalizeEventLink,
  parseEventStartDate,
  sortEvents,
} = require('../digest-utils');

test('normalizes and deduplicates event links', () => {
  const events = [
    { link: 'https://www.facebook.com/events/123/?ref=foo' },
    { link: 'https://www.facebook.com/events/123/' },
    { link: 'https://www.facebook.com/events/456/' },
  ];

  const output = dedupeEvents(events);
  assert.equal(output.length, 2);
  assert.equal(output[0].link, 'https://www.facebook.com/events/123');
});

test('parses upcoming dates', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const startDate = parseEventStartDate('2026-01-02T10:00:00Z');
  assert.ok(isUpcoming(startDate, now));
});

test('sorts by distance and then date', () => {
  const events = [
    { distanceKm: 20, startDate: new Date('2026-01-03T00:00:00Z') },
    { distanceKm: 10, startDate: new Date('2026-01-04T00:00:00Z') },
    { distanceKm: 10, startDate: new Date('2026-01-02T00:00:00Z') },
  ];

  const sorted = sortEvents(events);
  assert.equal(sorted[0].startDate.toISOString(), '2026-01-02T00:00:00.000Z');
  assert.equal(sorted[1].startDate.toISOString(), '2026-01-04T00:00:00.000Z');
});

test('computes dhaka distance', () => {
  const distance = haversineDistanceKm(23.8103, 90.4125, 23.7465, 90.3760);
  assert.ok(distance > 0);
});

test('normalizes relative links', () => {
  assert.equal(normalizeEventLink('/events/999/?acontext=abc'), 'https://www.facebook.com/events/999');
});
