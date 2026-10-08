"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  randomInt,
  shuffle,
  normalizeEventUrl,
  deduplicateEvents,
  buildSearchUrl,
} = require("../scraper");

test("randomInt returns values within the requested range", () => {
  for (let i = 0; i < 100; i += 1) {
    const value = randomInt(5, 10);

    assert.ok(value >= 5);
    assert.ok(value <= 10);
    assert.equal(Number.isInteger(value), true);
  }
});

test("randomInt supports a single-value range", () => {
  assert.equal(randomInt(5, 5), 5);
});

test("randomInt rejects an invalid range", () => {
  assert.throws(() => randomInt(10, 5));
});

test("shuffle keeps all items", () => {
  const input = ["a", "b", "c", "d", "e"];
  const output = shuffle(input);

  assert.deepEqual([...output].sort(), [...input].sort());
  assert.deepEqual(input, ["a", "b", "c", "d", "e"]);
});

test("normalizeEventUrl removes query parameters and fragments", () => {
  assert.equal(
    normalizeEventUrl(
      "https://www.facebook.com/events/123456/?foo=bar#section",
    ),
    "https://www.facebook.com/events/123456/",
  );
});

test("normalizeEventUrl returns null for invalid URLs", () => {
  assert.equal(normalizeEventUrl("not a url"), null);
});

test("deduplicateEvents removes duplicate event URLs", () => {
  const events = [
    {
      name: "First Event",
      link: "https://www.facebook.com/events/123/",
    },
    {
      name: "Duplicate Event",
      link: "https://www.facebook.com/events/123/?ref=search",
    },
    {
      name: "Second Event",
      link: "https://www.facebook.com/events/456/",
    },
  ];

  assert.deepEqual(deduplicateEvents(events), [
    {
      name: "First Event",
      link: "https://www.facebook.com/events/123/",
    },
    {
      name: "Second Event",
      link: "https://www.facebook.com/events/456/",
    },
  ]);
});

test("deduplicateEvents ignores invalid URLs", () => {
  const events = [
    {
      name: "Invalid",
      link: "not-a-url",
    },
    {
      name: "Valid",
      link: "https://www.facebook.com/events/123/",
    },
  ];

  assert.deepEqual(deduplicateEvents(events), [
    {
      name: "Valid",
      link: "https://www.facebook.com/events/123/",
    },
  ]);
});

test("buildSearchUrl creates the expected Facebook search URL", () => {
  const url = buildSearchUrl("Machine Learning");

  assert.equal(
    url,
    "https://www.facebook.com/events/search/?q=Machine%20Learning%20Bangladesh",
  );
});
