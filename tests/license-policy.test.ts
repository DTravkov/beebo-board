import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Plain JavaScript policy module is intentionally dependency-free.
import { permitted } from '../scripts/license-policy.mjs';

test('license policy parses all tokens, dual licensing, conjunctions, and invalid expressions', () => {
  for (const value of [
    'MIT',
    'Apache-2.0',
    '(MIT OR GPL-3.0-only)',
    '(GPL-3.0-only OR MIT)',
    'MIT AND BSD-3-Clause',
    '(MIT OR ISC) AND Apache-2.0',
  ])
    assert.equal(permitted(value), true, value);
  for (const value of [
    'GPL-3.0-only',
    'MPL-2.0',
    'MIT AND GPL-3.0-only',
    'MIT OR',
    'MIT ISC',
    'MIT WITH unknown',
    '(MIT',
    'MIT)',
    'MIT; GPL-3.0',
    '',
    null,
    'LicenseRef-private',
  ])
    assert.equal(permitted(value), false, String(value));
});
