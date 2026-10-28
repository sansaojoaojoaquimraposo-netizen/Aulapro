'use strict';
// Subconjunto de 'crypto' usado pelo AulaPro: randomBytes, randomInt e HMAC-SHA1 (2FA/TOTP).
const rnd = (n) => { const a = new Uint8Array(n); (globalThis.crypto || {}).getRandomValues(a); return a; };
const comoBuf = (u8) => (typeof Buffer !== 'undefined' ? Buffer.from(u8) : u8);
function randomBytes(n) { return comoBuf(rnd(n)); }
function randomInt(a, b) { if (b === undefined) { b = a; a = 0; } const r = new Uint32Array(1); globalThis.crypto.getRandomValues(r); return a + (r[0] % (b - a)); }

function sha1(m) { // m: Uint8Array -> Uint8Array(20)
  const rotl = (x, n) => (x << n) | (x >>> (32 - n));
  const len = m.length, tot = (((len + 8) >> 6) + 1) << 6, w = new Uint8Array(tot);
  w.set(m); w[len] = 0x80; const dv = new DataView(w.buffer);
  dv.setUint32(tot - 8, Math.floor((len * 8) / 4294967296)); dv.setUint32(tot - 4, (len * 8) >>> 0);
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0; const W = new Uint32Array(80);
  for (let o = 0; o < tot; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 80; i++) W[i] = rotl(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const [f, k] = i < 20 ? [(b & c) | (~b & d), 0x5A827999] : i < 40 ? [b ^ c ^ d, 0x6ED9EBA1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8F1BBCDC] : [b ^ c ^ d, 0xCA62C1D6];
      const t = (rotl(a, 5) + f + e + k + W[i]) >>> 0; e = d; d = c; c = rotl(b, 30) >>> 0; b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20), o = new DataView(out.buffer); [h0, h1, h2, h3, h4].forEach((h, i) => o.setUint32(i * 4, h)); return out;
}
function hmacSha1(key, msg) {
  if (key.length > 64) key = sha1(key);
  const k = new Uint8Array(64); k.set(key);
  const ip = k.map((x) => x ^ 0x36), op = k.map((x) => x ^ 0x5c);
  const a = new Uint8Array(64 + msg.length); a.set(ip); a.set(msg, 64);
  const inner = sha1(a); const b = new Uint8Array(84); b.set(op); b.set(inner, 64); return sha1(b);
}
function createHmac(alg, key) {
  if (alg !== 'sha1') throw new Error('Algoritmo não suportado: ' + alg);
  const partes = []; const u8 = (x) => (typeof x === 'string' ? new TextEncoder().encode(x) : new Uint8Array(x));
  return { update(d) { partes.push(u8(d)); return this; }, digest() { const n = partes.reduce((s, p) => s + p.length, 0); const m = new Uint8Array(n); let o = 0; for (const p of partes) { m.set(p, o); o += p.length; } return comoBuf(hmacSha1(u8(key), m)); } };
}
module.exports = { randomBytes, randomInt, createHmac };
