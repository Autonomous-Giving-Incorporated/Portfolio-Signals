import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeDonationLink, publicDonationLink } from '../src/app/donation-link.mjs';

test('normalizeDonationLink accepts HTTPS and rejects everything else', () => {
  assert.equal(
    normalizeDonationLink('https://www.every.org/hacker-dojo'),
    'https://www.every.org/hacker-dojo',
  );
  assert.equal(normalizeDonationLink(''), null);
  assert.equal(normalizeDonationLink(null), null);
  assert.throws(() => normalizeDonationLink('http://example.com/give'), /DONATION_LINK_INVALID/);
  assert.throws(() => normalizeDonationLink('https://user:pass@example.com/give'), /DONATION_LINK_INVALID/);
  assert.throws(() => normalizeDonationLink('not-a-url'), /DONATION_LINK_INVALID/);
});

test('publicDonationLink never invents a URL', () => {
  assert.equal(publicDonationLink(''), null);
  assert.equal(publicDonationLink('http://insecure.example/give'), null);
  assert.equal(publicDonationLink('https://www.every.org/hacker-dojo'), 'https://www.every.org/hacker-dojo');
});
