const encoder = new TextEncoder();
export function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[a-zA-Z0-9_-]+$/.test(value))
    throw new Error('Invalid invitation key.');
  try {
    return Uint8Array.from(
      atob(value.replaceAll('-', '+').replaceAll('_', '/')),
      (char) => char.charCodeAt(0),
    );
  } catch {
    throw new Error('Invalid invitation key.');
  }
}
export function createSecret() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}
export async function deriveRoomKeys(secret: string, room: string) {
  const bytes = fromBase64Url(secret);
  if (bytes.length !== 32)
    throw new Error('Invitation keys must contain 32 random bytes.');
  const material = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, [
    'deriveKey',
    'deriveBits',
  ]);
  const params = { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(room) };
  const encryption = await crypto.subtle.deriveKey(
    { ...params, info: encoder.encode('beebo/encryption/v1') },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const admission = toBase64Url(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { ...params, info: encoder.encode('beebo/admission/v1') },
        material,
        256,
      ),
    ),
  );
  return { encryption, admission };
}
export async function admissionHash(token: string) {
  return toBase64Url(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(token)),
    ),
  );
}
export async function encrypt(
  key: CryptoKey,
  room: string,
  data: Uint8Array<ArrayBuffer>,
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(room) },
      key,
      data,
    ),
  );
  const result = new Uint8Array(iv.length + encrypted.length);
  result.set(iv);
  result.set(encrypted, iv.length);
  return result.buffer;
}
export async function decrypt(
  key: CryptoKey,
  room: string,
  data: ArrayBuffer,
): Promise<Uint8Array<ArrayBuffer>> {
  if (data.byteLength < 28) throw new Error('Invalid encrypted frame.');
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: data.slice(0, 12),
        additionalData: encoder.encode(room),
      },
      key,
      data.slice(12),
    ),
  );
}
