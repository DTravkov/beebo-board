import { spawn } from 'node:child_process';

const children = [
  spawn(
    process.execPath,
    [
      '--env-file-if-exists=.env',
      '--watch',
      '--import',
      'tsx',
      'server/index.ts',
    ],
    { stdio: 'inherit' },
  ),
  spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--host',
      process.env.DEV_HOST ?? '127.0.0.1',
    ],
    { stdio: 'inherit' },
  ),
];
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    close(1);
  });
  child.on('exit', (code) => close(code ?? 0));
}
process.on('SIGINT', () => close());
process.on('SIGTERM', () => close());
