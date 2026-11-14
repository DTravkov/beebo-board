import { readFile, mkdir, writeFile, chmod, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { validateComposeConfig, turnConfig } from './compose-config.mjs';

try {
  const path = process.argv[2] ?? '.env.compose';
  const env = { ...parseEnv(await readFile(path, 'utf8')), ...process.env };
  const review = JSON.parse(
    await readFile(
      env.IMAGE_LICENSE_REVIEW ?? '.deploy/image-review.json',
      'utf8',
    ),
  );
  validateComposeConfig(env, review);
  for (const directory of ['.deploy', '.deploy/coturn']) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
  }
  // The protected parent directories restrict host access; the bind-mounted
  // files must be readable by the distinct, non-root container UIDs.
  for (const [path, value] of [
    ['.deploy/turn-secret', env.TURN_SECRET],
    ['.deploy/coturn/turnserver.conf', turnConfig(env)],
  ]) {
    const temporary = resolve(`${path}.${randomUUID()}.tmp`);
    await writeFile(temporary, value, { mode: 0o444, flag: 'wx' });
    try {
      await chmod(path, 0o600);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await rename(temporary, path);
    await chmod(path, 0o444);
  }
  console.log(
    'Compose inputs validated and private relay configuration prepared. Image-review records are operator attestations, not automatic binary certification.',
  );
} catch (error) {
  console.error(
    error instanceof Error && error.code === 'ENOENT'
      ? 'Create .env.compose and the image review file first; see deploy/README.md.'
      : error.message,
  );
  process.exitCode = 1;
}
