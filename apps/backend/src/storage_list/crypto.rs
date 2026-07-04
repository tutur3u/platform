use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

// ---------------------------------------------------------------------------
// Time helpers (copied file-local from storage_analytics.rs).
// ---------------------------------------------------------------------------

pub(super) fn now_millis() -> i64 {
    #[cfg(feature = "native")]
    {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }
    #[cfg(not(feature = "native"))]
    {
        // The REST `expires_at.gt.now()` filter already excludes expired rows;
        // without a wall clock here we skip the defensive recheck (return 0 so
        // the comparison `expires_ms < 0` is never true).
        0
    }
}

/// Minimal ISO-8601 (`YYYY-MM-DDTHH:MM:SS[.fff][Z|+hh:mm]`) to epoch millis.
/// Returns `None` on parse failure (defensive recheck simply skips).
pub(super) fn iso8601_to_millis(value: &str) -> Option<i64> {
    let bytes = value.trim().as_bytes();
    if bytes.len() < 19 {
        return None;
    }
    let year = parse_uint(&bytes[0..4])? as i64;
    if bytes[4] != b'-' {
        return None;
    }
    let month = parse_uint(&bytes[5..7])? as i64;
    if bytes[7] != b'-' {
        return None;
    }
    let day = parse_uint(&bytes[8..10])? as i64;
    if bytes[10] != b'T' && bytes[10] != b' ' {
        return None;
    }
    let hour = parse_uint(&bytes[11..13])? as i64;
    if bytes[13] != b':' {
        return None;
    }
    let minute = parse_uint(&bytes[14..16])? as i64;
    if bytes[16] != b':' {
        return None;
    }
    let second = parse_uint(&bytes[17..19])? as i64;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    // Days since Unix epoch (1970-01-01), proleptic Gregorian.
    let a = (14 - month) / 12;
    let y = year + 4800 - a;
    let m = month + 12 * a - 3;
    let jdn = day + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045;
    let days_since_epoch = jdn - 2440588;

    let millis = (days_since_epoch * 86400 + hour * 3600 + minute * 60 + second) * 1000;
    Some(millis)
}

fn parse_uint(bytes: &[u8]) -> Option<u64> {
    if bytes.is_empty() {
        return None;
    }
    let mut acc: u64 = 0;
    for &b in bytes {
        if !b.is_ascii_digit() {
            return None;
        }
        acc = acc.checked_mul(10)?.checked_add((b - b'0') as u64)?;
    }
    Some(acc)
}

// ---------------------------------------------------------------------------
// Hex (copied file-local from storage_analytics.rs).
// ---------------------------------------------------------------------------

pub(super) fn hex_decode(input: &str) -> Option<Vec<u8>> {
    if !input.len().is_multiple_of(2) {
        return None;
    }
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len() / 2);
    let mut i = 0;
    while i < bytes.len() {
        let hi = hex_val(bytes[i])?;
        let lo = hex_val(bytes[i + 1])?;
        out.push((hi << 4) | lo);
        i += 2;
    }
    Some(out)
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// scrypt (RFC 7914) — copied file-local from storage_analytics.rs.
//
// Implements scrypt(password, salt, N, r, p, dk_len) exactly as Node's
// crypto.scrypt does with default parameters. Used only to verify already-issued
// API key hashes; no new external dependency is required.
// ---------------------------------------------------------------------------

pub(super) fn scrypt(
    password: &[u8],
    salt: &[u8],
    n: u32,
    r: u32,
    p: u32,
    dk_len: usize,
) -> Option<Vec<u8>> {
    // Parameter sanity (RFC 7914): N must be a power of two > 1.
    if n < 2 || (n & (n - 1)) != 0 {
        return None;
    }
    if r == 0 || p == 0 || dk_len == 0 {
        return None;
    }

    let block_len = 128usize.checked_mul(r as usize)?;
    let b_len = block_len.checked_mul(p as usize)?;

    // B = PBKDF2-HMAC-SHA256(password, salt, 1, p * 128 * r)
    let mut b = pbkdf2_hmac_sha256(password, salt, 1, b_len);

    // Scratch buffers reused across blocks.
    let words_per_block = block_len / 4; // 32 * r
    let mut v = vec![0u32; words_per_block * (n as usize)];
    let mut xy = vec![0u32; words_per_block * 2];

    for i in 0..(p as usize) {
        let off = i * block_len;
        let mut block_words = bytes_to_words_le(&b[off..off + block_len]);
        romix(&mut block_words, r as usize, n as usize, &mut v, &mut xy);
        words_to_bytes_le(&block_words, &mut b[off..off + block_len]);
    }

    // DK = PBKDF2-HMAC-SHA256(password, B, 1, dk_len)
    Some(pbkdf2_hmac_sha256(password, &b, 1, dk_len))
}

fn romix(block: &mut [u32], r: usize, n: usize, v: &mut [u32], xy: &mut [u32]) {
    let block_words = 32 * r;
    // X starts as the input block.
    xy[..block_words].copy_from_slice(&block[..block_words]);

    for i in 0..n {
        let v_off = i * block_words;
        v[v_off..v_off + block_words].copy_from_slice(&xy[..block_words]);
        block_mix(xy, r);
    }

    for _ in 0..n {
        // j = Integerify(X) mod N — last 64-byte (16-word) sub-block, low word.
        let j = (xy[(2 * r - 1) * 16] as usize) & (n - 1);
        let v_off = j * block_words;
        for k in 0..block_words {
            xy[k] ^= v[v_off + k];
        }
        block_mix(xy, r);
    }

    block[..block_words].copy_from_slice(&xy[..block_words]);
}

/// BlockMix using Salsa20/8. Operates in-place on `xy`, where the first
/// `32*r` words are the input/output X and the second `32*r` words are scratch Y.
fn block_mix(xy: &mut [u32], r: usize) {
    let block_words = 32 * r;
    let mut x = [0u32; 16];
    // X = B[2r-1]
    x.copy_from_slice(&xy[(2 * r - 1) * 16..(2 * r - 1) * 16 + 16]);

    for i in 0..(2 * r) {
        let bi = &xy[i * 16..i * 16 + 16];
        for k in 0..16 {
            x[k] ^= bi[k];
        }
        salsa20_8(&mut x);
        // Y[i] = X
        let y_off = block_words + i * 16;
        xy[y_off..y_off + 16].copy_from_slice(&x);
    }

    // B' = (Y[0], Y[2], ..., Y[2r-2], Y[1], Y[3], ..., Y[2r-1])
    for i in 0..r {
        let src = block_words + (i * 2) * 16;
        let dst = i * 16;
        let (front, back) = xy.split_at_mut(block_words);
        front[dst..dst + 16].copy_from_slice(&back[src - block_words..src - block_words + 16]);
    }
    for i in 0..r {
        let src = block_words + (i * 2 + 1) * 16;
        let dst = (r + i) * 16;
        let (front, back) = xy.split_at_mut(block_words);
        front[dst..dst + 16].copy_from_slice(&back[src - block_words..src - block_words + 16]);
    }
}

fn salsa20_8(b: &mut [u32; 16]) {
    let mut x = *b;
    for _ in 0..4 {
        // column rounds
        x[4] ^= x[0].wrapping_add(x[12]).rotate_left(7);
        x[8] ^= x[4].wrapping_add(x[0]).rotate_left(9);
        x[12] ^= x[8].wrapping_add(x[4]).rotate_left(13);
        x[0] ^= x[12].wrapping_add(x[8]).rotate_left(18);

        x[9] ^= x[5].wrapping_add(x[1]).rotate_left(7);
        x[13] ^= x[9].wrapping_add(x[5]).rotate_left(9);
        x[1] ^= x[13].wrapping_add(x[9]).rotate_left(13);
        x[5] ^= x[1].wrapping_add(x[13]).rotate_left(18);

        x[14] ^= x[10].wrapping_add(x[6]).rotate_left(7);
        x[2] ^= x[14].wrapping_add(x[10]).rotate_left(9);
        x[6] ^= x[2].wrapping_add(x[14]).rotate_left(13);
        x[10] ^= x[6].wrapping_add(x[2]).rotate_left(18);

        x[3] ^= x[15].wrapping_add(x[11]).rotate_left(7);
        x[7] ^= x[3].wrapping_add(x[15]).rotate_left(9);
        x[11] ^= x[7].wrapping_add(x[3]).rotate_left(13);
        x[15] ^= x[11].wrapping_add(x[7]).rotate_left(18);

        // row rounds
        x[1] ^= x[0].wrapping_add(x[3]).rotate_left(7);
        x[2] ^= x[1].wrapping_add(x[0]).rotate_left(9);
        x[3] ^= x[2].wrapping_add(x[1]).rotate_left(13);
        x[0] ^= x[3].wrapping_add(x[2]).rotate_left(18);

        x[6] ^= x[5].wrapping_add(x[4]).rotate_left(7);
        x[7] ^= x[6].wrapping_add(x[5]).rotate_left(9);
        x[4] ^= x[7].wrapping_add(x[6]).rotate_left(13);
        x[5] ^= x[4].wrapping_add(x[7]).rotate_left(18);

        x[11] ^= x[10].wrapping_add(x[9]).rotate_left(7);
        x[8] ^= x[11].wrapping_add(x[10]).rotate_left(9);
        x[9] ^= x[8].wrapping_add(x[11]).rotate_left(13);
        x[10] ^= x[9].wrapping_add(x[8]).rotate_left(18);

        x[12] ^= x[15].wrapping_add(x[14]).rotate_left(7);
        x[13] ^= x[12].wrapping_add(x[15]).rotate_left(9);
        x[14] ^= x[13].wrapping_add(x[12]).rotate_left(13);
        x[15] ^= x[14].wrapping_add(x[13]).rotate_left(18);
    }
    for i in 0..16 {
        b[i] = b[i].wrapping_add(x[i]);
    }
}

fn bytes_to_words_le(bytes: &[u8]) -> Vec<u32> {
    bytes
        .chunks_exact(4)
        .map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

fn words_to_bytes_le(words: &[u32], out: &mut [u8]) {
    for (i, w) in words.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&w.to_le_bytes());
    }
}

// ---------------------------------------------------------------------------
// PBKDF2-HMAC-SHA256 (copied file-local from storage_analytics.rs).
// ---------------------------------------------------------------------------

fn pbkdf2_hmac_sha256(password: &[u8], salt: &[u8], iterations: u32, dk_len: usize) -> Vec<u8> {
    const HASH_LEN: usize = 32;
    let blocks = dk_len.div_ceil(HASH_LEN);
    let mut out = Vec::with_capacity(blocks * HASH_LEN);

    for block_index in 1..=blocks as u32 {
        let mut u = hmac_sha256(password, &[salt, &block_index.to_be_bytes()].concat());
        let mut t = u;
        for _ in 1..iterations {
            u = hmac_sha256(password, &u);
            for k in 0..HASH_LEN {
                t[k] ^= u[k];
            }
        }
        out.extend_from_slice(&t);
    }

    out.truncate(dk_len);
    out
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> [u8; 32] {
    let mut mac =
        <HmacSha256 as KeyInit>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(data);
    let bytes = mac.finalize().into_bytes();
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    out
}
