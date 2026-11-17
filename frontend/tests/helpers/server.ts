import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));

type ServerConfig = { origins?: string[]; directEnabled?: boolean };

/** Browser smoke tests exercise the actual Uvicorn process. */
export function createApp(config: ServerConfig = {}) {
  let child: ChildProcess | undefined;
  async function close() {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
      return;
    const stopped = once(child, 'exit');
    child.kill();
    await stopped;
  }
  return {
    async listen({ port, host }: { port: number; host: string }) {
      const executable =
        process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
      const local = resolve(projectRoot, 'backend/.venv', executable);
      let output = '';
      let spawnError: Error | undefined;
      child = spawn(
        process.env.PYTHON ?? (existsSync(local) ? local : 'python'),
        [
          '-m',
          'uvicorn',
          'backend.src.main:app',
          '--host',
          host,
          '--port',
          String(port),
          '--no-access-log',
          '--no-proxy-headers',
          '--ws',
          'websockets',
          '--ws-max-size',
          '32768',
          '--ws-max-queue',
          '16',
          '--ws-per-message-deflate',
          'false',
          '--timeout-graceful-shutdown',
          '5',
          '--h11-max-incomplete-event-size',
          '16384',
        ],
        {
          cwd: projectRoot,
          env: {
            ...process.env,
            HOST: host,
            PORT: String(port),
            PUBLIC_ORIGIN: (config.origins ?? []).join(','),
            DIRECT_CONNECTIONS_ENABLED: String(config.directEnabled ?? false),
            TURN_URLS: '',
            TURN_SECRET: '',
            TURN_SECRET_FILE: '',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
      child.stdout?.on('data', (data) => {
        output = (output + String(data)).slice(-8192);
      });
      child.stderr?.on('data', (data) => {
        output = (output + String(data)).slice(-8192);
      });
      child.on('error', (error) => {
        spawnError = error;
      });
      const address = `http://${host}:${port}`;
      try {
        for (let attempt = 0; attempt < 100; attempt++) {
          if (spawnError) throw spawnError;
          if (child.exitCode !== null)
            throw new Error(output || 'Python server exited.');
          try {
            const response = await fetch(`${address}/api/health`, {
              signal: AbortSignal.timeout(500),
            });
            if (response.ok) return address;
          } catch {
            /* Wait for startup. */
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error(`Python server did not start: ${output}`);
      } catch (error) {
        await close();
        throw error;
      }
    },
    close,
  };
}
