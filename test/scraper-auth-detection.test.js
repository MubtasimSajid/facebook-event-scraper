const test = require('node:test');
const assert = require('node:assert/strict');

const { hasAuthOrChallengeIssue } = require('../scraper');

test('detects login/checkpoint/recover path redirects', () => {
  assert.equal(hasAuthOrChallengeIssue('https://www.facebook.com/login/?next=%2Fevents', 'Facebook'), true);
  assert.equal(
    hasAuthOrChallengeIssue('https://www.facebook.com/checkpoint/?next=%2Fevents', 'Facebook'),
    true,
  );
  assert.equal(hasAuthOrChallengeIssue('https://www.facebook.com/recover/initiate', 'Facebook'), true);
});

test('detects strong authentication challenge titles', () => {
  assert.equal(hasAuthOrChallengeIssue('https://www.facebook.com/', 'Security check'), true);
  assert.equal(hasAuthOrChallengeIssue('https://www.facebook.com/', 'Suspicious login attempt'), true);
  assert.equal(hasAuthOrChallengeIssue('https://www.facebook.com/', 'Code verification required'), true);
  assert.equal(hasAuthOrChallengeIssue('https://www.facebook.com/', 'Solve CAPTCHA'), true);
});

test('does not flag non-auth pages that contain checkpoint in query text', () => {
  assert.equal(
    hasAuthOrChallengeIssue(
      'https://www.facebook.com/events/search/?q=ai%20checkpoint%20workshop%20bangladesh',
      'Events | Facebook',
    ),
    false,
  );
});
