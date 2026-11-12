import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  admissionHash,
  createSecret,
  decrypt,
  deriveRoomKeys,
  encrypt,
} from '../src/lib/crypto';

test('room encryption authenticates payload, room, and key; uses fresh nonces', async () => {
  const secret = createSecret();
  const keys = await deriveRoomKeys(secret, 'room-one');
  const data = new TextEncoder().encode('A private tutoring note');
  const a = await encrypt(keys.encryption, 'room-one', data);
  const b = await encrypt(keys.encryption, 'room-one', data);
  assert.notDeepEqual(a, b);
  assert.deepEqual(await decrypt(keys.encryption, 'room-one', a), data);
  const modified = new Uint8Array(a.slice(0));
  modified[15] ^= 1;
  await assert.rejects(decrypt(keys.encryption, 'room-one', modified.buffer));
  await assert.rejects(decrypt(keys.encryption, 'room-two', a));
  const wrong = await deriveRoomKeys(createSecret(), 'room-one');
  await assert.rejects(decrypt(wrong.encryption, 'room-one', a));
  const same = await deriveRoomKeys(secret, 'room-one');
  assert.equal(same.admission, keys.admission);
  assert.equal((await admissionHash(keys.admission)).length, 43);
  assert.notEqual(keys.admission, secret);
  await assert.rejects(deriveRoomKeys('invalid', 'room-one'));
});
