const test = require('node:test');
const assert = require('node:assert/strict');

const { looksUnauthenticated } = require('../auth-facebook-session');

test('detects unauthenticated login/checkpoint/recover URLs', () => {
  assert.equal(looksUnauthenticated('https://www.facebook.com/login/', 'Facebook'), true);
  assert.equal(looksUnauthenticated('https://www.facebook.com/checkpoint/?next=%2F', 'Facebook'), true);
  assert.equal(looksUnauthenticated('https://www.facebook.com/recover/initiate', 'Facebook'), true);
});

test('detects strong challenge indicators in page title', () => {
  assert.equal(looksUnauthenticated('https://www.facebook.com/', 'Security check'), true);
  assert.equal(looksUnauthenticated('https://www.facebook.com/', 'Suspicious login attempt'), true);
  assert.equal(looksUnauthenticated('https://www.facebook.com/', 'Code verification required'), true);
  assert.equal(looksUnauthenticated('https://www.facebook.com/', 'Please solve CAPTCHA'), true);
});

test('does not flag generic "Log into Facebook" phrase alone', () => {
  assert.equal(looksUnauthenticated('https://www.facebook.com/', 'Log into Facebook'), false);
});
