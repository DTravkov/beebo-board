import * as Y from 'yjs';
import {
  admissionHash,
  createSecret,
  decrypt,
  deriveRoomKeys,
  encrypt,
  toBase64Url,
} from './crypto';
import { BoardDocument } from './document';
import { isShape, MAX_DOCUMENT_BYTES, MAX_OBJECTS } from '../shared/board';

export type Presence = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  updated: number;
};
export type RoomStatus = {
  state: 'offline' | 'connecting' | 'connected' | 'error';
  peers: number;
  message: string;
  policy?: 'relay' | 'all';
};
type Assembly = {
  kind: number;
  chunks: Map<number, Uint8Array<ArrayBuffer>>;
  total: number;
  bytes: number;
  created: number;
};
type Peer = {
  pc: RTCPeerConnection;
  channel?: RTCDataChannel;
  candidates: RTCIceCandidateInit[];
  incoming: Promise<void>;
  outgoing: Promise<void>;
  pending: number;
  receiving: number;
  assemblies: Map<string, Assembly>;
  seen: Set<string>;
  disconnectedTimer?: ReturnType<typeof setTimeout>;
};
const CHUNK = 12_000;
const MAX_QUEUE = MAX_DOCUMENT_BYTES * 2;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function readInvite(): { room: string; secret: string } | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const room = params.get('room');
  const secret = params.get('key');
  if (!room && !secret) return null;
  if (
    !room ||
    !/^[a-zA-Z0-9_-]{16,64}$/.test(room) ||
    !secret ||
    !/^[a-zA-Z0-9_-]{43}$/.test(secret)
  )
    throw new Error('This invitation is incomplete or invalid.');
  return { room, secret };
}
export function invitationUrl(room: string, secret: string) {
  const url = new URL(location.href);
  url.hash = new URLSearchParams({ room, key: secret }).toString();
  return url.toString();
}
export async function createRoom(policy: 'relay' | 'all') {
  const room = crypto.randomUUID();
  const secret = createSecret();
  const keys = await deriveRoomKeys(secret, room);
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId: room,
      verifier: await admissionHash(keys.admission),
      policy,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Could not create a room.');
  return { room, secret };
}

export class RoomSession {
  private socket?: WebSocket;
  private peers = new Map<string, Peer>();
  private key?: CryptoKey;
  private closed = false;
  private heartbeat?: ReturnType<typeof setInterval>;
  private connectTimeout?: ReturnType<typeof setTimeout>;
  private iceServers: RTCIceServer[] = [];
  private policy: 'relay' | 'all' = 'relay';
  private ready = false;
  private lastCursor = 0;
  private status: RoomStatus = {
    state: 'connecting',
    peers: 0,
    message: 'Connecting to your room…',
  };
  private presence = new Map<string, Presence>();
  private readonly remoteOrigin = {};
  private readonly onUpdate = (update: Uint8Array) => {
    this.broadcast(1, new Uint8Array(update));
  };
  private readonly updateHandler = (update: Uint8Array, origin: unknown) => {
    if (origin !== this.remoteOrigin) this.onUpdate(update);
  };

  constructor(
    private readonly board: BoardDocument,
    readonly room: string,
    private readonly secret: string,
    private readonly onStatus: (status: RoomStatus) => void,
    private readonly onPresence: (presence: Presence[]) => void,
    private readonly name: () => string,
    private readonly color: string,
  ) {}

  async connect() {
    const keys = await deriveRoomKeys(this.secret, this.room);
    if (this.closed) return;
    this.key = keys.encryption;
    this.board.doc.on('update', this.updateHandler);
    const url = new URL('/signal', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = (this.socket = new WebSocket(url));
    this.connectTimeout = setTimeout(() => {
      if (!this.ready) {
        this.setStatus(
          'error',
          'Connection timed out. Leave and try joining again.',
        );
        this.close();
      }
    }, 12_000);
    socket.onopen = () =>
      socket.send(
        JSON.stringify({
          type: 'join',
          room: this.room,
          token: keys.admission,
        }),
      );
    // Serialize signaling: candidate handling must follow setRemoteDescription.
    let incoming = Promise.resolve();
    socket.onmessage = (event) => {
      incoming = incoming
        .then(async () => {
          if (this.closed) return;
          await this.handleSignal(JSON.parse(String(event.data)));
        })
        .catch(() =>
          this.setStatus(
            'error',
            'A connection could not be negotiated. Leave and rejoin to try again.',
          ),
        );
    };
    socket.onerror = () =>
      this.setStatus('error', 'The signaling service could not be reached.');
    socket.onclose = (event) => {
      if (this.closed) return;
      this.setStatus(
        'error',
        event.reason || 'Room connection lost. Leave and rejoin to reconnect.',
      );
      this.close();
    };
    this.heartbeat = setInterval(() => {
      this.signal({ type: 'ping' });
      const now = Date.now();
      for (const [id, presence] of this.presence)
        if (now - presence.updated > 12_000) this.presence.delete(id);
      for (const peer of this.peers.values())
        for (const [id, assembly] of peer.assemblies)
          if (now - assembly.created > 10_000) peer.assemblies.delete(id);
      this.onPresence([...this.presence.values()]);
    }, 5000);
  }
  private setStatus(state: RoomStatus['state'], message: string) {
    this.status = {
      state,
      message,
      peers: [...this.peers.values()].filter(
        (peer) => peer.channel?.readyState === 'open',
      ).length,
      policy: this.policy,
    };
    this.onStatus(this.status);
  }
  private refresh() {
    if (this.closed) return;
    const count = [...this.peers.values()].filter(
      (peer) => peer.channel?.readyState === 'open',
    ).length;
    this.setStatus(
      'connected',
      count
        ? `Connected with ${count} ${count === 1 ? 'person' : 'people'}`
        : 'Room is ready. Invite someone in.',
    );
  }
  private signal(value: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(value));
  }
  private async handleSignal(message: Record<string, any>) {
    if (message.type === 'ready') {
      this.ready = true;
      clearTimeout(this.connectTimeout);
      this.iceServers = message.iceServers;
      this.policy = message.policy === 'all' ? 'all' : 'relay';
      if (this.policy === 'relay' && !this.iceServers.length)
        throw new Error('TURN is required.');
      this.refresh();
      for (const id of message.peers as string[]) {
        const peer = this.makePeer(id);
        this.attachChannel(
          id,
          peer,
          peer.pc.createDataChannel('beebo-v1', { ordered: true }),
        );
        await peer.pc.setLocalDescription(await peer.pc.createOffer());
        this.signal({
          type: 'signal',
          to: id,
          signal: { type: 'offer', sdp: peer.pc.localDescription?.sdp },
        });
      }
    } else if (message.type === 'signal' && typeof message.from === 'string') {
      const id = message.from;
      const signal = message.signal;
      const peer = this.peers.get(id) ?? this.makePeer(id);
      if (signal.type === 'offer') {
        await peer.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        for (const candidate of peer.candidates.splice(0))
          await peer.pc.addIceCandidate(candidate);
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        this.signal({
          type: 'signal',
          to: id,
          signal: { type: 'answer', sdp: peer.pc.localDescription?.sdp },
        });
      } else if (signal.type === 'answer') {
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        for (const candidate of peer.candidates.splice(0))
          await peer.pc.addIceCandidate(candidate);
      } else if (signal.type === 'candidate' && signal.candidate) {
        if (peer.pc.remoteDescription)
          await peer.pc.addIceCandidate(signal.candidate);
        else if (peer.candidates.length < 64)
          peer.candidates.push(signal.candidate);
      }
    } else if (message.type === 'peer-left') {
      this.removePeer(message.peer);
    }
  }
  private makePeer(id: string): Peer {
    if (this.peers.size >= 7)
      throw new Error('Room participant limit exceeded.');
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceTransportPolicy: this.policy,
    });
    const peer: Peer = {
      pc,
      candidates: [],
      incoming: Promise.resolve(),
      outgoing: Promise.resolve(),
      pending: 0,
      receiving: 0,
      assemblies: new Map(),
      seen: new Set(),
    };
    this.peers.set(id, peer);
    pc.onicecandidate = (event) => {
      if (event.candidate)
        this.signal({
          type: 'signal',
          to: id,
          signal: { type: 'candidate', candidate: event.candidate.toJSON() },
        });
    };
    pc.ondatachannel = (event) => this.attachChannel(id, peer, event.channel);
    pc.onconnectionstatechange = () => {
      clearTimeout(peer.disconnectedTimer);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed')
        this.removePeer(id);
      else if (pc.connectionState === 'disconnected')
        peer.disconnectedTimer = setTimeout(() => this.removePeer(id), 10_000);
    };
    return peer;
  }
  private attachChannel(id: string, peer: Peer, channel: RTCDataChannel) {
    if (peer.channel) {
      channel.close();
      return;
    }
    peer.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 64_000;
    channel.onopen = () => {
      this.send(peer, 0, new Uint8Array(Y.encodeStateVector(this.board.doc)));
      this.refresh();
    };
    channel.onclose = () => this.removePeer(id);
    channel.onerror = () => this.removePeer(id);
    channel.onmessage = (event) => {
      const data = event.data;
      if (
        !(data instanceof ArrayBuffer) ||
        data.byteLength > CHUNK + 42 ||
        peer.receiving + data.byteLength > MAX_QUEUE
      ) {
        this.removePeer(id);
        return;
      }
      peer.receiving += data.byteLength;
      peer.incoming = peer.incoming
        .then(async () => {
          if (this.peers.get(id) === peer) await this.receive(id, peer, data);
        })
        .catch(() => {
          this.removePeer(id);
          this.setStatus(
            'error',
            'A peer sent invalid data and was disconnected. Your local board is still available.',
          );
        })
        .finally(() => {
          peer.receiving -= data.byteLength;
        });
    };
  }
  private send(peer: Peer, kind: number, data: Uint8Array<ArrayBuffer>) {
    if (
      data.byteLength > MAX_DOCUMENT_BYTES ||
      peer.pending + data.byteLength > MAX_QUEUE
    ) {
      peer.pc.close();
      return;
    }
    peer.pending += data.byteLength;
    peer.outgoing = peer.outgoing
      .then(async () => {
        const channel = peer.channel;
        if (
          !channel ||
          channel.readyState !== 'open' ||
          this.closed ||
          !this.key
        )
          return;
        const id = crypto.getRandomValues(new Uint8Array(8));
        const total = Math.max(1, Math.ceil(data.byteLength / CHUNK));
        for (let i = 0; i < total; i++) {
          if (channel.readyState !== 'open') return;
          if (channel.bufferedAmount > 128_000) {
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Slow peer'));
              }, 10_000);
              function cleanup() {
                clearTimeout(timeout);
                channel!.removeEventListener('bufferedamountlow', done);
                channel!.removeEventListener('close', done);
              }
              function done() {
                cleanup();
                resolve();
              }
              channel.addEventListener('bufferedamountlow', done, {
                once: true,
              });
              channel.addEventListener('close', done, { once: true });
              if (channel.bufferedAmount <= 128_000) done();
            });
          }
          if (channel.readyState !== 'open') return;
          const chunk = data.subarray(i * CHUNK, (i + 1) * CHUNK);
          const frame = new Uint8Array(14 + chunk.length);
          const view = new DataView(frame.buffer);
          frame[0] = 1;
          frame[1] = kind;
          frame.set(id, 2);
          view.setUint16(10, i);
          view.setUint16(12, total);
          frame.set(chunk, 14);
          channel.send(await encrypt(this.key, this.room, frame));
        }
      })
      .catch(() => peer.pc.close())
      .finally(() => {
        peer.pending -= data.byteLength;
      });
  }
  private broadcast(kind: number, data: Uint8Array<ArrayBuffer>) {
    if (this.closed) return;
    for (const peer of this.peers.values())
      if (
        peer.channel?.readyState === 'open' &&
        (kind !== 2 ||
          (peer.pending < CHUNK && peer.channel.bufferedAmount < 64_000))
      )
        this.send(peer, kind, data);
  }
  private async receive(id: string, peer: Peer, encrypted: ArrayBuffer) {
    const frame = await decrypt(this.key!, this.room, encrypted);
    if (frame.length < 14 || frame[0] !== 1 || frame[1] > 2)
      throw new Error('Invalid protocol frame.');
    const view = new DataView(frame.buffer);
    const index = view.getUint16(10);
    const total = view.getUint16(12);
    const messageId = toBase64Url(frame.subarray(2, 10));
    if (
      total < 1 ||
      total > Math.ceil(MAX_DOCUMENT_BYTES / CHUNK) ||
      index >= total ||
      peer.seen.has(messageId)
    )
      return;
    let assembly = peer.assemblies.get(messageId);
    if (!assembly) {
      if (peer.assemblies.size >= 4)
        throw new Error('Too many partial messages.');
      assembly = {
        kind: frame[1],
        total,
        chunks: new Map(),
        bytes: 0,
        created: Date.now(),
      };
      peer.assemblies.set(messageId, assembly);
    }
    if (
      assembly.total !== total ||
      assembly.kind !== frame[1] ||
      assembly.chunks.has(index)
    )
      throw new Error('Invalid chunks.');
    const chunk = frame.slice(14);
    assembly.chunks.set(index, chunk);
    assembly.bytes += chunk.length;
    if (assembly.bytes > MAX_DOCUMENT_BYTES)
      throw new Error('Message too large.');
    if (assembly.chunks.size !== total) return;
    peer.assemblies.delete(messageId);
    peer.seen.add(messageId);
    if (peer.seen.size > 256)
      peer.seen.delete(peer.seen.values().next().value!);
    const data = new Uint8Array(assembly.bytes);
    let offset = 0;
    for (let i = 0; i < total; i++) {
      const part = assembly.chunks.get(i)!;
      data.set(part, offset);
      offset += part.length;
    }
    if (assembly.kind === 0) {
      this.send(
        peer,
        1,
        new Uint8Array(Y.encodeStateAsUpdate(this.board.doc, data)),
      );
    } else if (assembly.kind === 1) {
      // Validate in an isolated replica so malformed updates cannot poison the live document.
      const candidate = new Y.Doc();
      try {
        Y.applyUpdate(candidate, Y.encodeStateAsUpdate(this.board.doc));
        Y.applyUpdate(candidate, data);
        const objects = candidate.getMap('objects');
        const order = candidate.getArray('order');
        const metadata = candidate.getMap('metadata');
        if (
          [...candidate.share.keys()].some(
            (key) => !['objects', 'order', 'metadata'].includes(key),
          )
        )
          throw new Error('Unexpected shared state.');
        if (
          objects.size > MAX_OBJECTS ||
          order.length > MAX_OBJECTS * 2 ||
          metadata.size > 1
        )
          throw new Error('Document limits exceeded.');
        for (const [id, value] of objects)
          if (
            !(value instanceof Y.Map) ||
            !isShape(value.toJSON()) ||
            value.get('id') !== id
          )
            throw new Error('Invalid shared object.');
        const title = metadata.get('title');
        if (
          title !== undefined &&
          (typeof title !== 'string' || title.length > 120)
        )
          throw new Error('Invalid title.');
        if ([...metadata.keys()].some((key) => key !== 'title'))
          throw new Error('Invalid metadata.');
        if (
          order
            .toArray()
            .some((value) => typeof value !== 'string' || value.length > 80)
        )
          throw new Error('Invalid order.');
        if (Y.encodeStateAsUpdate(candidate).length > MAX_DOCUMENT_BYTES)
          throw new Error(
            'Shared history is full. Export and start a new room.',
          );
        Y.applyUpdate(this.board.doc, data, this.remoteOrigin);
      } finally {
        candidate.destroy();
      }
    } else {
      if (data.byteLength > 512) throw new Error('Invalid presence.');
      const value = JSON.parse(textDecoder.decode(data));
      if (
        typeof value.name !== 'string' ||
        value.name.length > 32 ||
        !/^#[a-f0-9]{6}$/i.test(value.color) ||
        !Number.isFinite(value.x) ||
        !Number.isFinite(value.y) ||
        Math.abs(value.x) > 1_000_000 ||
        Math.abs(value.y) > 1_000_000
      )
        throw new Error('Invalid presence.');
      this.presence.set(id, {
        id,
        name: value.name,
        color: value.color,
        x: value.x,
        y: value.y,
        updated: Date.now(),
      });
      this.onPresence([...this.presence.values()]);
    }
  }
  cursor(x: number, y: number, lowBandwidth: boolean) {
    const now = Date.now();
    if (now - this.lastCursor < (lowBandwidth ? 200 : 70)) return;
    this.lastCursor = now;
    this.broadcast(
      2,
      textEncoder.encode(
        JSON.stringify({
          name: this.name().slice(0, 32),
          color: this.color,
          x,
          y,
        }),
      ),
    );
  }
  private removePeer(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    clearTimeout(peer.disconnectedTimer);
    peer.pc.onconnectionstatechange = null;
    if (peer.channel) peer.channel.onclose = null;
    peer.channel?.close();
    peer.pc.close();
    this.presence.delete(id);
    this.onPresence([...this.presence.values()]);
    this.refresh();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    clearTimeout(this.connectTimeout);
    this.board.doc.off('update', this.updateHandler);
    this.socket?.close();
    for (const id of [...this.peers.keys()]) this.removePeer(id);
    this.presence.clear();
    this.onPresence([]);
  }
}
