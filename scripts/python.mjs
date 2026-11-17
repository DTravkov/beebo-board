import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function pythonExecutable() {
  const local =
    process.platform === 'win32'
      ? '.venv/Scripts/python.exe'
      : '.venv/bin/python';
  return process.env.PYTHON ?? (existsSync(local) ? local : 'python');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const child = spawn(pythonExecutable(), process.argv.slice(2), {
    stdio: 'inherit',
  });
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => child.kill(signal));
}
