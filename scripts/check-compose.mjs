import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

// Rendering only: these synthetic digests are never pulled or approved for use.
const directory = await mkdtemp(join(tmpdir(), 'beebo-compose-validation-'));
try {
  const roles = [
    'NODE_BUILD_IMAGE',
    'NODE_RUNTIME_IMAGE',
    'CADDY_IMAGE',
    'COTURN_IMAGE',
  ];
  const env = {
    APP_DOMAIN: 'board.school.test',
    TURN_DOMAIN: 'relay.school.test',
    TURN_PUBLIC_IP: '1.1.1.1',
  };
  roles.forEach((role, i) => {
    env[role] =
      `registry.school.test/${role.toLowerCase()}@sha256:${String(i + 1).repeat(64)}`;
  });
  await mkdir(join(directory, '.deploy/coturn'), { recursive: true });
  await mkdir(join(directory, 'deploy'));
  await mkdir(join(directory, 'docker-config'));
  await writeFile(
    join(directory, '.deploy/turn-secret'),
    'synthetic-validation-secret-not-for-deployment',
  );
  await writeFile(
    join(directory, '.deploy/coturn/turnserver.conf'),
    'synthetic fixture, never launched',
  );
  await copyFile('deploy/Caddyfile', join(directory, 'deploy/Caddyfile'));
  const envFile = join(directory, 'compose.env');
  await writeFile(
    envFile,
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
  );
  const { stdout } = await promisify(execFile)(
    'docker',
    [
      '--config',
      join(directory, 'docker-config'),
      'compose',
      '--env-file',
      envFile,
      '--project-directory',
      directory,
      '-f',
      resolve('docker-compose.yml'),
      'config',
      '--format',
      'json',
    ],
    { env: { ...process.env, ...env }, maxBuffer: 1024 * 1024 },
  );
  const config = JSON.parse(stdout);
  assert.deepEqual(Object.keys(config.services).sort(), [
    'app',
    'https',
    'turn',
  ]);
  assert.equal(
    config.services.app.environment.DIRECT_CONNECTIONS_ENABLED,
    'false',
  );
  assert.equal(
    config.services.app.environment.PUBLIC_ORIGIN,
    'https://board.school.test',
  );
  assert.equal(
    config.services.app.environment.TURN_SECRET_FILE,
    '/run/secrets/turn_secret',
  );
  assert.equal(config.services.app.ports, undefined);
  assert.equal(
    config.services.app.build.args.NODE_BUILD_IMAGE,
    env.NODE_BUILD_IMAGE,
  );
  assert.equal(config.services.https.image, env.CADDY_IMAGE);
  assert.equal(config.services.turn.image, env.COTURN_IMAGE);
  assert.deepEqual(config.services.turn.entrypoint, ['/usr/bin/turnserver']);
  assert.equal(config.services.turn.read_only, true);
  console.log(
    'Compose configuration renders correctly: three services, internal app, relay-only defaults, file-held secret, and explicit image inputs. No images pulled or containers started.',
  );
} finally {
  const target = resolve(directory);
  if (
    dirname(target) !== resolve(tmpdir()) ||
    !basename(target).startsWith('beebo-compose-validation-')
  )
    throw new Error('Unexpected temporary cleanup path.');
  await rm(target, { recursive: true, force: true });
}
