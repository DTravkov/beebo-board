import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
// @ts-expect-error Dependency-free deployment validation is shared with the CLI.
import * as compose from '../scripts/compose-config.mjs';
const { IMAGE_ROLES, validateComposeConfig, turnConfig } = compose;

function fixture() {
  const env: Record<string, string> = {
    APP_DOMAIN: 'board.school.test',
    TURN_DOMAIN: 'relay.school.test',
    TURN_PUBLIC_IP: '1.1.1.1',
    TURN_SECRET: 'synthetic-test-secret-not-for-deployment-12345',
  };
  const images = Object.fromEntries(
    IMAGE_ROLES.map((role: string, index: number) => {
      const reference = `registry.school.test/${role.toLowerCase()}@sha256:${String(index + 1).repeat(64)}`;
      env[role] = reference;
      return [
        role,
        {
          reference,
          licenses: ['MIT', 'Apache-2.0'],
          evidence:
            'Synthetic fixture only; not an approval of any actual image.',
        },
      ];
    }),
  );
  return {
    env,
    review: { reviewedBy: 'Test fixture', reviewedAt: '2026-11-14', images },
  };
}

test('Compose preflight fails closed for missing, unpinned, or copyleft image evidence', () => {
  const { env, review } = fixture();
  assert.doesNotThrow(() => validateComposeConfig(env, review));
  assert.throws(
    () =>
      validateComposeConfig({ ...env, CADDY_IMAGE: 'caddy:latest' }, review),
    /digest/,
  );
  assert.throws(
    () => validateComposeConfig(env, { ...review, reviewedBy: '' }),
    /review/,
  );
  const rejected = structuredClone(review);
  rejected.images.COTURN_IMAGE.licenses = ['MIT', 'GPL-3.0-only'];
  assert.throws(() => validateComposeConfig(env, rejected), /permissive/);
  assert.throws(
    () =>
      validateComposeConfig(
        { ...env, APP_DOMAIN: 'board.example.org' },
        review,
      ),
    /real DNS/,
  );
  assert.throws(
    () => validateComposeConfig({ ...env, TURN_SECRET: 'short' }, review),
    /TURN_SECRET/,
  );
  assert.throws(
    () =>
      validateComposeConfig({ ...env, TURN_PUBLIC_IP: '203.0.113.10' }, review),
    /public relay/,
  );
  assert.throws(
    () =>
      validateComposeConfig({ ...env, TURN_PUBLIC_IP: '192.168.1.5' }, review),
    /public relay/,
  );
  assert.throws(
    () => validateComposeConfig({ ...env, TURN_PUBLIC_IP: '::1' }, review),
    /IPv4/,
  );
});

test('TURN config uses matching fixed relay ports and a file-held shared secret', () => {
  const { env } = fixture();
  const config = turnConfig(env);
  assert.ok(config.includes(`static-auth-secret=${env.TURN_SECRET}\n`));
  for (const value of [
    'min-port=49160',
    'max-port=49260',
    'listening-port=3478',
    'use-auth-secret',
    'no-tls',
    'no-cli',
    'external-ip=1.1.1.1',
  ])
    assert.ok(config.split('\n').includes(value));
  assert.ok(!config.includes('no-auth'));
});

test('preparation is repeatable, keeps matching file-held secrets, and rejects invalid replacements', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'beebo-compose-'));
  try {
    const { env, review } = fixture();
    const reviewFile = join(directory, 'review.json');
    const envFile = join(directory, 'compose.env');
    await writeFile(reviewFile, JSON.stringify(review));
    await writeFile(
      envFile,
      Object.entries(env)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    );
    const command = fileURLToPath(
      new URL('../scripts/prepare-compose.mjs', import.meta.url),
    );
    const prepare = (extra: Record<string, string> = {}) =>
      promisify(execFile)(process.execPath, [command, envFile], {
        cwd: directory,
        env: {
          ...process.env,
          ...env,
          IMAGE_LICENSE_REVIEW: reviewFile,
          ...extra,
        },
      });
    await prepare();
    assert.equal(
      await readFile(join(directory, '.deploy/turn-secret'), 'utf8'),
      env.TURN_SECRET,
    );
    const rotated = 'rotated-synthetic-test-secret-not-real-123456';
    await prepare({ TURN_SECRET: rotated });
    assert.equal(
      await readFile(join(directory, '.deploy/turn-secret'), 'utf8'),
      rotated,
    );
    assert.ok(
      (
        await readFile(
          join(directory, '.deploy/coturn/turnserver.conf'),
          'utf8',
        )
      ).includes(`static-auth-secret=${rotated}`),
    );
    await assert.rejects(prepare({ COTURN_IMAGE: '' }), /COTURN_IMAGE/);
    assert.equal(
      await readFile(join(directory, '.deploy/turn-secret'), 'utf8'),
      rotated,
    );
  } finally {
    const target = resolve(directory);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith('beebo-compose-')
    )
      throw new Error('Unexpected temporary cleanup path.');
    await rm(target, { recursive: true, force: true });
  }
});
