import Fastify from 'fastify';
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';

export type ServerConfig = {
  origins?: string[];
  turnUrls?: string[];
  turnSecret?: string;
  directEnabled?: boolean;
  roomTtlMs?: number;
};
type Member = { id: string; socket: WebSocket };
type Room = {
  verifier: Buffer;
  policy: 'relay' | 'all';
  created: number;
  lastActive: number;
  members: Map<string, Member>;
};
const ID = /^[a-zA-Z0-9_-]{16,64}$/;
const TOKEN = /^[a-zA-Z0-9_-]{43}$/;
const MAX_PARTICIPANTS = 8;
const MAX_ROOMS = 250;
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

export function createApp(config: ServerConfig = {}) {
  const app = Fastify({
    logger: false,
    bodyLimit: 4096,
    requestTimeout: 10_000,
  });
  const rooms = new Map<string, Room>();
  const origins = new Set(
    config.origins ?? [
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:3001',
      'http://localhost:3001',
    ],
  );
  const turnConfigured = Boolean(config.turnUrls?.length && config.turnSecret);
  const ttl = config.roomTtlMs ?? 2 * 60 * 60 * 1000;
  const attempts = new Map<string, { count: number; until: number }>();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 32_768,
    perMessageDeflate: false,
  });
  function allowed(ip: string) {
    const now = Date.now();
    let entry = attempts.get(ip);
    if (!entry || entry.until < now) {
      if (attempts.size >= 10_000 && !entry) return false;
      entry = { count: 0, until: now + 60_000 };
      attempts.set(ip, entry);
    }
    return ++entry.count <= 60;
  }
  function send(socket: WebSocket, value: unknown) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 262_144) {
      socket.close(1008, 'Slow connection');
      return;
    }
    socket.send(JSON.stringify(value));
  }
  function destroyRoom(id: string, room: Room) {
    for (const { socket } of room.members.values())
      socket.close(1008, 'Room expired');
    rooms.delete(id);
  }
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [id, room] of rooms)
      if (
        now - room.created > ttl ||
        (!room.members.size && now - room.lastActive > 10 * 60_000)
      )
        destroyRoom(id, room);
    for (const [ip, attempt] of attempts)
      if (attempt.until < now) attempts.delete(ip);
  }, 30_000);
  cleanup.unref();

  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' blob: data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/config', async () => ({
    turnConfigured,
    directEnabled: Boolean(config.directEnabled),
    maxParticipants: MAX_PARTICIPANTS,
  }));
  app.post('/api/rooms', async (request, reply) => {
    if (!request.headers.origin || !origins.has(request.headers.origin))
      return reply.code(403).send({ error: 'Origin not allowed.' });
    if (!allowed(request.ip))
      return reply
        .code(429)
        .send({ error: 'Too many room requests. Try again in a minute.' });
    const body = request.body as Record<string, unknown> | null;
    if (
      !body ||
      typeof body.roomId !== 'string' ||
      !ID.test(body.roomId) ||
      typeof body.verifier !== 'string' ||
      !TOKEN.test(body.verifier) ||
      !['relay', 'all'].includes(body.policy as string)
    )
      return reply.code(400).send({ error: 'Invalid room request.' });
    if (body.policy === 'relay' && !turnConfigured)
      return reply.code(503).send({
        error:
          'The operator has not configured TURN yet. You can keep working privately on this device.',
      });
    if (body.policy === 'all' && !config.directEnabled)
      return reply
        .code(403)
        .send({ error: 'Direct connections are disabled by the operator.' });
    if (rooms.size >= MAX_ROOMS)
      return reply
        .code(503)
        .send({ error: 'The server is full. Please try later.' });
    if (rooms.has(body.roomId))
      return reply.code(409).send({ error: 'That room already exists.' });
    rooms.set(body.roomId, {
      verifier: Buffer.from(body.verifier, 'base64url'),
      policy: body.policy as Room['policy'],
      created: Date.now(),
      lastActive: Date.now(),
      members: new Map(),
    });
    return reply.code(201).send({ roomId: body.roomId });
  });
  const dist = resolve('dist');
  app.get('/*', async (request, reply) => {
    let path: string;
    try {
      path = decodeURIComponent(request.url.split('?')[0]);
    } catch {
      return reply.code(400).send('Invalid URL');
    }
    if (path.startsWith('/api/') || path.startsWith('/signal'))
      return reply.code(404).send({ error: 'Not found.' });
    const file = resolve(dist, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(dist + sep)) return reply.code(403).send('Forbidden');
    try {
      return reply
        .type(mime[extname(file)] ?? 'application/octet-stream')
        .send(await readFile(file));
    } catch {
      return reply
        .code(404)
        .send('Build the client with npm run build, or use npm run dev.');
    }
  });

  app.server.on('upgrade', (request, socket, head) => {
    if (
      request.url !== '/signal' ||
      !request.headers.origin ||
      !origins.has(request.headers.origin) ||
      wss.clients.size >= MAX_ROOMS * MAX_PARTICIPANTS + 100 ||
      !allowed(request.socket.remoteAddress ?? 'unknown')
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) =>
      wss.emit('connection', ws),
    );
  });
  wss.on('connection', (socket: WebSocket) => {
    let room: Room | undefined;
    let roomId = '';
    let memberId = '';
    let windowStart = Date.now();
    let messages = 0;
    const timeout = setTimeout(() => socket.close(1008, 'Join required'), 5000);
    socket.on('error', () => socket.close());
    socket.on('message', (raw, binary) => {
      if (binary) {
        socket.close(1008, 'Text signaling required');
        return;
      }
      if (Date.now() - windowStart > 10_000) {
        messages = 0;
        windowStart = Date.now();
      }
      if (++messages > 100) {
        socket.close(1008, 'Rate limit');
        return;
      }
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        socket.close(1008, 'Invalid message');
        return;
      }
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        socket.close(1008, 'Invalid message');
        return;
      }
      if (!room) {
        if (
          message.type !== 'join' ||
          typeof message.room !== 'string' ||
          !ID.test(message.room) ||
          typeof message.token !== 'string' ||
          !TOKEN.test(message.token)
        ) {
          socket.close(1008, 'Invalid admission');
          return;
        }
        const target = rooms.get(message.room);
        const hash = createHash('sha256').update(message.token).digest();
        if (
          !target ||
          Date.now() - target.created > ttl ||
          !timingSafeEqual(target.verifier, hash)
        ) {
          socket.close(1008, 'Room unavailable or invitation invalid');
          return;
        }
        if (target.members.size >= MAX_PARTICIPANTS) {
          socket.close(1008, 'Room is full (8 people)');
          return;
        }
        room = target;
        roomId = message.room;
        memberId = randomUUID();
        const peers = [...room.members.keys()];
        room.members.set(memberId, { id: memberId, socket });
        room.lastActive = Date.now();
        clearTimeout(timeout);
        const username = `${Math.floor(Date.now() / 1000) + 3600}:${memberId}`;
        const iceServers = turnConfigured
          ? [
              {
                urls: config.turnUrls!,
                username,
                credential: createHmac('sha1', config.turnSecret!)
                  .update(username)
                  .digest('base64'),
              },
            ]
          : [];
        send(socket, {
          type: 'ready',
          self: memberId,
          peers,
          policy: room.policy,
          iceServers,
          expiresAt: room.created + ttl,
        });
        for (const { socket: other } of room.members.values())
          if (other !== socket)
            send(other, { type: 'peer-joined', peer: memberId });
        return;
      }
      room.lastActive = Date.now();
      if (message.type === 'ping') {
        send(socket, { type: 'pong' });
        return;
      }
      if (
        message.type !== 'signal' ||
        typeof message.to !== 'string' ||
        typeof message.signal !== 'object' ||
        !message.signal
      ) {
        socket.close(1008, 'Invalid signaling');
        return;
      }
      const signal = message.signal as Record<string, unknown>;
      if (!['offer', 'answer', 'candidate'].includes(signal.type as string)) {
        socket.close(1008, 'Unsupported signal');
        return;
      }
      const target = room.members.get(message.to);
      if (target && target.id !== memberId)
        send(target.socket, { type: 'signal', from: memberId, signal });
    });
    socket.on('close', () => {
      clearTimeout(timeout);
      if (!room) return;
      room.members.delete(memberId);
      room.lastActive = Date.now();
      for (const { socket: other } of room.members.values())
        send(other, { type: 'peer-left', peer: memberId });
      if (!rooms.has(roomId)) room.members.clear();
    });
  });
  app.addHook('onClose', async () => {
    clearInterval(cleanup);
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
  return app;
}
