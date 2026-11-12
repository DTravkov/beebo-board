import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { createApp } from '../server/app';

const origin = 'http://localhost:5173';
const roomId = () => randomBytes(16).toString('base64url');
const token = () => randomBytes(32).toString('base64url');
const verifier = (value: string) =>
  createHash('sha256').update(value).digest('base64url');

test('room creation fails closed without TURN, rejects origins and invalid requests', async () => {
  const app = createApp();
  try {
    const body = {
      roomId: roomId(),
      verifier: verifier(token()),
      policy: 'relay',
    };
    const request = (
      payload: Record<string, unknown>,
      requestOrigin = origin,
    ) =>
      app.inject({
        method: 'POST',
        url: '/api/rooms',
        headers: { origin: requestOrigin },
        payload,
      });
    assert.equal((await request(body)).statusCode, 503);
    assert.equal((await request({ ...body, policy: 'all' })).statusCode, 403);
    assert.equal(
      (await request(body, 'https://untrusted.example')).statusCode,
      403,
    );
    assert.equal((await request({ ...body, verifier: 'bad' })).statusCode, 400);
    const config = (await app.inject('/api/config')).json();
    assert.equal(config.turnConfigured, false);
    assert.equal(config.directEnabled, false);
    const response = await app.inject('/api/health');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
    assert.ok(
      String(response.headers['content-security-policy']).includes(
        "frame-ancestors 'none'",
      ),
    );
  } finally {
    await app.close();
  }
});

test('signaling authenticates admission, isolates rooms, caps participants, and expires rooms', async () => {
  const app = createApp({ directEnabled: true, roomTtlMs: 1500 });
  const sockets: WebSocket[] = [];
  try {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace('http:', 'ws:') + '/signal';
    const key = token();
    const id = roomId();
    const create = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: { origin },
      payload: { roomId: id, verifier: verifier(key), policy: 'all' },
    });
    assert.equal(create.statusCode, 201);
    async function join(room: string, admission: string) {
      const socket = new WebSocket(wsUrl, { origin });
      sockets.push(socket);
      await once(socket, 'open');
      const first = Promise.race([
        once(socket, 'message').then(([data]) => ({
          message: JSON.parse(String(data)),
        })),
        once(socket, 'close').then(([, reason]) => ({
          reason: String(reason),
        })),
      ]);
      socket.send(JSON.stringify({ type: 'join', room, token: admission }));
      return { socket, first: await first };
    }
    const rejected = await join(id, token());
    assert.ok('reason' in rejected.first);
    const members = [];
    for (let index = 0; index < 8; index++) {
      const member = await join(id, key);
      assert.ok('message' in member.first);
      if ('message' in member.first) {
        assert.equal(member.first.message.type, 'ready');
        assert.equal(member.first.message.policy, 'all');
        assert.equal(member.first.message.peers.length, index);
      }
      members.push(member);
    }
    const ninth = await join(id, key);
    assert.ok('reason' in ninth.first);
    if ('reason' in ninth.first) assert.match(ninth.first.reason, /full/);
    // An unrecognized room cannot obtain peers, credentials, or forwarded signaling.
    assert.ok('reason' in (await join(roomId(), key)).first);
    await new Promise((resolve) => setTimeout(resolve, 1550));
    const expired = await join(id, key);
    assert.ok('reason' in expired.first);
  } finally {
    for (const socket of sockets) socket.terminate();
    await app.close();
  }
});

test('TURN credentials are temporary and are returned only after successful admission', async () => {
  const app = createApp({
    turnUrls: ['turn:relay.example:3478'],
    turnSecret: 'operator-test-secret',
  });
  let socket: WebSocket | undefined;
  try {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const key = token();
    const id = roomId();
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/rooms',
          headers: { origin },
          payload: { roomId: id, verifier: verifier(key), policy: 'relay' },
        })
      ).statusCode,
      201,
    );
    const config = (await app.inject('/api/config')).json();
    assert.ok(!('iceServers' in config));
    socket = new WebSocket(address.replace('http:', 'ws:') + '/signal', {
      origin,
    });
    await once(socket, 'open');
    const message = once(socket, 'message');
    socket.send(JSON.stringify({ type: 'join', room: id, token: key }));
    const ready = JSON.parse(String((await message)[0]));
    assert.equal(ready.policy, 'relay');
    assert.deepEqual(ready.iceServers[0].urls, ['turn:relay.example:3478']);
    const expires = Number(ready.iceServers[0].username.split(':')[0]);
    assert.ok(
      expires > Date.now() / 1000 + 3500 && expires < Date.now() / 1000 + 3700,
    );
    assert.equal(typeof ready.iceServers[0].credential, 'string');
    assert.ok(!JSON.stringify(ready).includes('operator-test-secret'));
  } finally {
    socket?.terminate();
    await app.close();
  }
});
