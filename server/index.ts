import { createApp } from './app.js';
import { readFile } from 'node:fs/promises';

if (process.env.TURN_SECRET_FILE && process.env.TURN_SECRET)
  throw new Error('Set TURN_SECRET_FILE or TURN_SECRET, not both.');
const turnSecret = process.env.TURN_SECRET_FILE
  ? (await readFile(process.env.TURN_SECRET_FILE, 'utf8')).trim()
  : process.env.TURN_SECRET;

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be a valid TCP port.');
const turnUrls = (process.env.TURN_URLS ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
if (turnUrls.some((url) => !/^turns?:[^\s]+$/.test(url)))
  throw new Error('TURN_URLS must contain turn: or turns: URLs.');
if (Boolean(turnUrls.length) !== Boolean(turnSecret))
  throw new Error('Configure both TURN_URLS and TURN_SECRET.');
const app = createApp({
  origins: process.env.PUBLIC_ORIGIN?.split(',').map((value) => value.trim()),
  turnUrls,
  turnSecret,
  directEnabled: process.env.DIRECT_CONNECTIONS_ENABLED === 'true',
});
try {
  await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
  console.log(
    `Beebo signaling + production client: http://${process.env.HOST ?? '127.0.0.1'}:${port}`,
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Could not start server.',
  );
  process.exitCode = 1;
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
