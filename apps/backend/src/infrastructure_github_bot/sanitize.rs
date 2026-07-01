use super::*;

// ---------------------------------------------------------------------------
// sanitizeAuditMetadata (hand-port; no regex crate available)
// ---------------------------------------------------------------------------

const REDACTED_VALUE: &str = "[REDACTED]";
const REDACTED_EMAIL: &str = "[REDACTED_EMAIL]";
const REDACTED_PATH: &str = "[REDACTED_PATH]";
const REDACTED_URL: &str = "[REDACTED_URL]";

const SENSITIVE_KEY_TOKENS: &[&str] = &[
    "access_token",
    "access-token",
    "accesstoken",
    "api_key",
    "api-key",
    "apikey",
    "authorization",
    "client_secret",
    "client-secret",
    "clientsecret",
    "cookie",
    "password",
    "refresh_token",
    "refresh-token",
    "refreshtoken",
    "secret",
    "session",
    "token",
];

const SENSITIVE_HOSTNAME_TLDS: &[&str] = &[
    "com",
    "dev",
    "internal",
    "io",
    "local",
    "localhost",
    "net",
    "org",
    "test",
];

const SENSITIVE_KEY_VALUE_TOKENS: &[&str] = &[
    "access_token",
    "access-token",
    "accesstoken",
    "api_key",
    "api-key",
    "apikey",
    "authorization",
    "client_secret",
    "client-secret",
    "clientsecret",
    "cookie",
    "password",
    "refresh_token",
    "refresh-token",
    "refreshtoken",
    "secret",
    "session",
    "token",
];

/// Top-level entry: `sanitizeAuditMetadata(metadata)` -> object of sanitized
/// values (capped at 20 entries; keys sanitized with maxLength 80).
pub(super) fn sanitize_audit_metadata(metadata: &Value) -> Value {
    // Legacy `sanitizeAuditMetadata` casts the input to a record and runs the
    // recursive value sanitizer; in practice `metadata` is always an object.
    sanitize_value(metadata)
}

fn sanitize_value(value: &Value) -> Value {
    match value {
        Value::Null => Value::Null,
        Value::String(text) => Value::String(sanitize_public_text(text, 200).unwrap_or_default()),
        Value::Number(number) => {
            if number.as_f64().map(f64::is_finite).unwrap_or(false) {
                value.clone()
            } else {
                Value::String(number.to_string())
            }
        }
        Value::Bool(flag) => Value::Bool(*flag),
        Value::Array(items) => Value::Array(
            items
                .iter()
                .take(20)
                .map(sanitize_value)
                .collect::<Vec<_>>(),
        ),
        Value::Object(map) => {
            let mut out = Map::new();
            for (key, entry) in map.iter().take(20) {
                let sanitized_key =
                    sanitize_public_text(key, 80).unwrap_or_else(|| "field".to_owned());
                out.insert(sanitized_key, sanitize_value(entry));
            }
            Value::Object(out)
        }
    }
}

/// Port of `sanitizeGitHubBotPublicText`. Returns `None` when the sanitized
/// result is empty (legacy returns `null`); callers coerce `None` to "".
fn sanitize_public_text(value: &str, max_length: usize) -> Option<String> {
    let mut text = value.to_owned();

    text = redact_sensitive_query_params(&text);
    text = redact_sensitive_key_values(&text);
    text = redact_bearer_tokens(&text);
    text = redact_jwts(&text);
    text = redact_emails(&text);
    text = redact_local_paths(&text);
    text = redact_urls(&text);
    text = redact_hostnames(&text);
    text = collapse_whitespace(&text);

    let trimmed = text.trim().to_owned();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.chars().count() > max_length {
        let keep = max_length.saturating_sub(3);
        let prefix: String = trimmed.chars().take(keep).collect();
        Some(format!("{prefix}..."))
    } else {
        Some(trimmed)
    }
}

fn collapse_whitespace(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut in_ws = false;
    for ch in value.chars() {
        if ch.is_whitespace() {
            if !in_ws {
                out.push(' ');
                in_ws = true;
            }
        } else {
            out.push(ch);
            in_ws = false;
        }
    }
    out
}

/// `([?&]key=)value` -> `([?&]key=)[REDACTED]` for sensitive query params,
/// stopping the value at the next `&` or whitespace.
fn redact_sensitive_query_params(value: &str) -> String {
    let bytes: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < bytes.len() {
        let ch = bytes[i];
        if ch == '?' || ch == '&' {
            // Try to match `<delim>key=`.
            if let Some((key_len, _matched_key)) = match_sensitive_query_key(&bytes[i + 1..]) {
                let after_key = i + 1 + key_len;
                if after_key < bytes.len() && bytes[after_key] == '=' {
                    out.push(ch);
                    for character in bytes.iter().take(after_key).skip(i + 1) {
                        out.push(*character);
                    }
                    out.push('=');
                    out.push_str(REDACTED_VALUE);
                    // Skip the original value until `&` or whitespace.
                    let mut j = after_key + 1;
                    while j < bytes.len() && bytes[j] != '&' && !bytes[j].is_whitespace() {
                        j += 1;
                    }
                    i = j;
                    continue;
                }
            }
        }
        out.push(ch);
        i += 1;
    }
    out
}

/// Matches a sensitive query-param key (case-insensitive) at the start of the
/// slice, returning its char length when followed by `=`.
fn match_sensitive_query_key(rest: &[char]) -> Option<(usize, &'static str)> {
    for token in SENSITIVE_KEY_TOKENS {
        let token_chars: Vec<char> = token.chars().collect();
        if rest.len() >= token_chars.len()
            && rest[..token_chars.len()]
                .iter()
                .zip(token_chars.iter())
                .all(|(a, b)| a.eq_ignore_ascii_case(b))
        {
            return Some((token_chars.len(), token));
        }
    }
    None
}

/// `key: value` / `key=value` -> `key: [REDACTED]` for sensitive keys, where the
/// key stands as a whole word and the value is a quoted string, a Bearer token,
/// or a run of non-delimiter chars.
fn redact_sensitive_key_values(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if is_word_boundary(&chars, i)
            && let Some((token, key_len)) = match_sensitive_word(&chars, i)
        {
            // Skip optional whitespace, then require `:` or `=`.
            let mut ws = i + key_len;
            while ws < chars.len() && chars[ws].is_whitespace() {
                ws += 1;
            }
            if ws < chars.len() && (chars[ws] == ':' || chars[ws] == '=') {
                // Skip whitespace after the separator.
                let mut v = ws + 1;
                while v < chars.len() && chars[v].is_whitespace() {
                    v += 1;
                }
                let value_end = consume_key_value(&chars, v);
                if value_end > v {
                    out.push_str(token);
                    out.push_str(": ");
                    out.push_str(REDACTED_VALUE);
                    i = value_end;
                    continue;
                }
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn is_word_boundary(chars: &[char], i: usize) -> bool {
    if i == 0 {
        return true;
    }
    let prev = chars[i - 1];
    !(prev.is_ascii_alphanumeric() || prev == '_')
}

/// Matches a sensitive word at position `i` ending on a word boundary.
fn match_sensitive_word(chars: &[char], i: usize) -> Option<(&'static str, usize)> {
    // Note: legacy pattern excludes `apikey`/`session` "as word" differently;
    // it uses the same token list as query params except `api_key`/`apikey`
    // variants are matched as words too. We match the shared token list.
    for token in SENSITIVE_KEY_VALUE_TOKENS {
        let token_chars: Vec<char> = token.chars().collect();
        let end = i + token_chars.len();
        if chars.len() >= end
            && chars[i..end]
                .iter()
                .zip(token_chars.iter())
                .all(|(a, b)| a.eq_ignore_ascii_case(b))
        {
            // Require a trailing word boundary (next char not alnum/_).
            let boundary =
                end >= chars.len() || !(chars[end].is_ascii_alphanumeric() || chars[end] == '_');
            if boundary {
                return Some((token, token_chars.len()));
            }
        }
    }
    None
}

/// Consume a key-value: quoted string (`"..."` or `'...'`), a Bearer token, or a
/// run of non-`,;}]` whitespace-free characters.
fn consume_key_value(chars: &[char], start: usize) -> usize {
    if start >= chars.len() {
        return start;
    }
    let first = chars[start];
    if first == '"' || first == '\'' {
        let mut j = start + 1;
        while j < chars.len() && chars[j] != first {
            j += 1;
        }
        if j < chars.len() {
            j += 1; // include closing quote
        }
        return j;
    }
    // Bearer <token>
    if matches_ci(chars, start, "bearer") {
        let mut j = start + 6;
        while j < chars.len() && chars[j].is_whitespace() {
            j += 1;
        }
        while j < chars.len() && is_token_char(chars[j]) {
            j += 1;
        }
        return j;
    }
    // [^\s,;}\]]+
    let mut j = start;
    while j < chars.len() {
        let c = chars[j];
        if c.is_whitespace() || c == ',' || c == ';' || c == '}' || c == ']' {
            break;
        }
        j += 1;
    }
    j
}

fn matches_ci(chars: &[char], start: usize, needle: &str) -> bool {
    let needle_chars: Vec<char> = needle.chars().collect();
    let end = start + needle_chars.len();
    chars.len() >= end
        && chars[start..end]
            .iter()
            .zip(needle_chars.iter())
            .all(|(a, b)| a.eq_ignore_ascii_case(b))
}

fn is_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '~' | '+' | '/' | '=' | '-')
}

/// `\bBearer\s+<token>` -> `Bearer [REDACTED]`.
fn redact_bearer_tokens(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if is_word_boundary(&chars, i) && matches_ci(&chars, i, "bearer") {
            let after = i + 6;
            // Require at least one whitespace then a token.
            let mut j = after;
            let mut ws_count = 0;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
                ws_count += 1;
            }
            if ws_count >= 1 && j < chars.len() && is_token_char(chars[j]) {
                while j < chars.len() && is_token_char(chars[j]) {
                    j += 1;
                }
                out.push_str("Bearer ");
                out.push_str(REDACTED_VALUE);
                i = j;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// `\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b` -> `[REDACTED]`.
fn redact_jwts(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if is_word_boundary(&chars, i)
            && matches_exact(&chars, i, "eyJ")
            && let Some(end) = match_jwt(&chars, i)
        {
            out.push_str(REDACTED_VALUE);
            i = end;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn matches_exact(chars: &[char], start: usize, needle: &str) -> bool {
    let needle_chars: Vec<char> = needle.chars().collect();
    let end = start + needle_chars.len();
    chars.len() >= end && chars[start..end] == needle_chars[..]
}

fn is_jwt_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '-'
}

/// Match a JWT starting at `i` (already known to begin with `eyJ`). Three
/// dot-separated runs of jwt chars; returns the end index past the token.
fn match_jwt(chars: &[char], start: usize) -> Option<usize> {
    // First segment: eyJ + jwt chars.
    let mut j = start + 3;
    while j < chars.len() && is_jwt_char(chars[j]) {
        j += 1;
    }
    if j >= chars.len() || chars[j] != '.' {
        return None;
    }
    j += 1;
    let seg2_start = j;
    while j < chars.len() && is_jwt_char(chars[j]) {
        j += 1;
    }
    if j == seg2_start || j >= chars.len() || chars[j] != '.' {
        return None;
    }
    j += 1;
    let seg3_start = j;
    while j < chars.len() && is_jwt_char(chars[j]) {
        j += 1;
    }
    if j == seg3_start {
        return None;
    }
    // Trailing word boundary.
    if j < chars.len() && (chars[j].is_ascii_alphanumeric() || chars[j] == '_') {
        return None;
    }
    Some(j)
}

/// Email pattern -> `[REDACTED_EMAIL]`.
fn redact_emails(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if is_word_boundary(&chars, i)
            && let Some(end) = match_email(&chars, i)
        {
            out.push_str(REDACTED_EMAIL);
            i = end;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn is_email_local(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '%' | '+' | '-')
}

fn is_email_domain(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '.' || c == '-'
}

/// `[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}` (case-insensitive).
fn match_email(chars: &[char], start: usize) -> Option<usize> {
    let mut j = start;
    while j < chars.len() && is_email_local(chars[j]) {
        j += 1;
    }
    if j == start || j >= chars.len() || chars[j] != '@' {
        return None;
    }
    j += 1;
    let domain_start = j;
    while j < chars.len() && is_email_domain(chars[j]) {
        j += 1;
    }
    if j == domain_start {
        return None;
    }
    // Require a final `.<tld>` of >= 2 ascii letters within the matched domain.
    // Find the last dot inside [domain_start, j).
    let domain: Vec<char> = chars[domain_start..j].to_vec();
    let last_dot = domain.iter().rposition(|c| *c == '.')?;
    let tld = &domain[last_dot + 1..];
    if tld.len() < 2 || !tld.iter().all(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    Some(j)
}

/// Local-path pattern -> `[REDACTED_PATH]` (`/Users/...`, `/home/...`,
/// `/private/...`, or `X:\...`), stopping at whitespace or `)`.
fn redact_local_paths(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if let Some(end) = match_local_path(&chars, i) {
            out.push_str(REDACTED_PATH);
            i = end;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn match_local_path(chars: &[char], start: usize) -> Option<usize> {
    let unix_prefixes = ["/Users/", "/home/", "/private/"];
    for prefix in unix_prefixes {
        if matches_exact(chars, start, prefix) {
            let mut j = start + prefix.chars().count();
            while j < chars.len() && !chars[j].is_whitespace() && chars[j] != ')' {
                j += 1;
            }
            return Some(j);
        }
    }
    // Windows: `[A-Za-z]:\`
    if start + 2 < chars.len()
        && chars[start].is_ascii_alphabetic()
        && chars[start + 1] == ':'
        && chars[start + 2] == '\\'
    {
        let mut j = start + 3;
        while j < chars.len() && !chars[j].is_whitespace() && chars[j] != ')' {
            j += 1;
        }
        return Some(j);
    }
    None
}

/// `https?://...` -> `[REDACTED_URL]`, stopping at whitespace or `)`.
fn redact_urls(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if matches_ci(&chars, i, "http://") || matches_ci(&chars, i, "https://") {
            let mut j = i;
            while j < chars.len() && !chars[j].is_whitespace() && chars[j] != ')' {
                j += 1;
            }
            out.push_str(REDACTED_URL);
            i = j;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// Hostname pattern: `(label\.)+TLD` for known TLDs -> `[REDACTED_URL]`.
fn redact_hostnames(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if is_hostname_boundary(&chars, i)
            && let Some(end) = match_hostname(&chars, i)
        {
            out.push_str(REDACTED_URL);
            i = end;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn is_hostname_label_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '-'
}

fn is_hostname_boundary(chars: &[char], i: usize) -> bool {
    if i == 0 {
        return true;
    }
    // `\b` before an alnum: previous char must be a non-word char.
    let prev = chars[i - 1];
    !(prev.is_ascii_alphanumeric() || prev == '_')
}

/// `(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:TLD)\b` (case-insensitive).
fn match_hostname(chars: &[char], start: usize) -> Option<usize> {
    let mut j = start;
    let mut had_label = false;

    loop {
        // One DNS label followed by a dot.
        let label_start = j;
        if j >= chars.len() || !chars[j].is_ascii_alphanumeric() {
            break;
        }
        while j < chars.len() && is_hostname_label_char(chars[j]) {
            j += 1;
        }
        // Label must end with an alnum (regex requires trailing [a-z0-9]).
        if chars[j - 1] == '-' {
            return None;
        }
        if j >= chars.len() || chars[j] != '.' {
            // No dot after this label; the previous labels (if any) plus a TLD
            // pattern must have matched. Reset to consider this run as the TLD.
            j = label_start;
            break;
        }
        j += 1; // consume '.'
        had_label = true;
    }

    if !had_label {
        return None;
    }

    // Now match the TLD at `j`.
    for tld in SENSITIVE_HOSTNAME_TLDS {
        if matches_ci(chars, j, tld) {
            let end = j + tld.chars().count();
            // Trailing `\b`: next char must not be a word char.
            let boundary =
                end >= chars.len() || !(chars[end].is_ascii_alphanumeric() || chars[end] == '_');
            if boundary {
                return Some(end);
            }
        }
    }
    None
}
