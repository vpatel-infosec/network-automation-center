import test from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt, sha256, randomToken } from '../src/utils/crypto.js';

test('encrypt/decrypt round-trip keeps the plaintext', () => {
  const secret = 'S3cret! switch password';
  const payload = encrypt(secret);
  assert.match(payload, /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  assert.notEqual(payload, secret);
  assert.equal(decrypt(payload), secret);
});

test('encrypt produces a fresh ciphertext every time (random IV)', () => {
  const a = encrypt('same-input');
  const b = encrypt('same-input');
  assert.notEqual(a, b);
  assert.equal(decrypt(a), decrypt(b));
});

test('empty secrets are stored as empty strings', () => {
  assert.equal(encrypt(''), '');
  assert.equal(encrypt(null), '');
  assert.equal(decrypt(''), '');
});

test('tampered payloads are rejected by GCM authentication', () => {
  const payload = encrypt('integrity-check');
  const parts = payload.split(':');
  const flipped = Buffer.from(parts[3], 'base64');
  flipped[0] ^= 0xff;
  const tampered = `v1:${parts[1]}:${parts[2]}:${flipped.toString('base64')}`;
  assert.throws(() => decrypt(tampered));
});

test('invalid payload formats are rejected', () => {
  assert.throws(() => decrypt('not-an-encrypted-value'), /Invalid encrypted payload/);
});

test('sha256 is stable and hex encoded', () => {
  assert.equal(sha256('abc').length, 64);
  assert.equal(sha256('abc'), sha256('abc'));
  assert.notEqual(sha256('abc'), sha256('abd'));
});

test('randomToken length matches the requested byte count', () => {
  assert.equal(randomToken(16).length, 32);
});
