// SHA-256 ticket work format and bounded solver adapted from EduFest guest admission.
const encoder = new TextEncoder();
export const MIN_POW_DIFFICULTY = 19;
export const MAX_POW_DIFFICULTY = 22;

const INITIAL = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
]);
const ROUND = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (word: number, count: number) =>
  (word >>> count) | (word << (32 - count));
const ticketHash = (ticket: string) =>
  crypto.subtle.digest('SHA-256', encoder.encode(ticket));
const validBits = (bits: number) =>
  Number.isInteger(bits) &&
  bits >= MIN_POW_DIFFICULTY &&
  bits <= MAX_POW_DIFFICULTY;

export async function matchesGuestWork(
  ticket: string,
  nonce: unknown,
  difficulty: number
): Promise<boolean> {
  if (
    !validBits(difficulty) ||
    typeof nonce !== 'number' ||
    !Number.isInteger(nonce) ||
    nonce < 0 ||
    nonce > 0xffffffff
  )
    return false;
  const challenge = new Uint8Array(36);
  challenge.set(new Uint8Array(await ticketHash(ticket)));
  new DataView(challenge.buffer).setUint32(32, nonce);
  const digest = await crypto.subtle.digest('SHA-256', challenge);
  return new DataView(digest).getUint32(0) >>> (32 - difficulty) === 0;
}

/** Specialized one-block SHA-256 search for SHA256(ticket hash || nonce32be). */
export async function solveGuestWork(
  ticket: string,
  difficulty: number,
  signal?: AbortSignal,
  cooperative = false
): Promise<number | null> {
  if (!validBits(difficulty)) return null;
  const words = new Uint32Array(64);
  const seed = new DataView(await ticketHash(ticket));
  for (let index = 0; index < 8; index++)
    words[index] = seed.getUint32(index * 4);
  words[9] = 0x80000000;
  words[15] = 36 * 8;
  const limit = 24 * (1 << difficulty);
  for (let nonce = 0; nonce < limit && !signal?.aborted; nonce++) {
    words[8] = nonce;
    for (let index = 16; index < 64; index++) {
      const x = words[index - 15]!;
      const y = words[index - 2]!;
      words[index] =
        (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) +
        words[index - 7]! +
        (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) +
        words[index - 16]!;
    }
    let a = INITIAL[0]!,
      b = INITIAL[1]!,
      c = INITIAL[2]!,
      d = INITIAL[3]!;
    let e = INITIAL[4]!,
      f = INITIAL[5]!,
      g = INITIAL[6]!,
      h = INITIAL[7]!;
    for (let index = 0; index < 64; index++) {
      const t1 =
        (h +
          (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) +
          ((e & f) ^ (~e & g)) +
          ROUND[index]! +
          words[index]!) |
        0;
      const t2 =
        (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) +
        ((a & b) ^ (a & c) ^ (b & c));
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    if ((a + INITIAL[0]!) >>> (32 - difficulty) === 0) return nonce;
    if (cooperative && (nonce & 8191) === 8191)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return null;
}
