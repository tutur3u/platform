// ---------------------------------------------------------------------------
// content.ts port (stripMarkdownToText / normalize).
// ---------------------------------------------------------------------------

/// Faithful port of `stripMarkdownToText` from `features/forms/content.ts`. The order of
/// transformations matches the legacy `.replace(...)` chain so outputs stay identical.
pub(super) fn strip_markdown_to_text(value: &str) -> String {
    let mut s = value.to_owned();
    // ![alt](url) -> alt
    s = replace_image_links(&s);
    // [text](url) -> text
    s = replace_text_links(&s);
    // ```...``` (triple backtick fenced) -> ' '
    s = replace_fenced_code(&s);
    // `code` -> code
    s = replace_inline_code(&s);
    // ^#{1,6}\s+ (multiline) -> ''
    s = strip_line_prefix_heading(&s);
    // ^\s*>\s? (multiline) -> ''
    s = strip_line_prefix_blockquote(&s);
    // ^\s*([-*+]|\d+\.)\s+ (multiline) -> ''
    s = strip_line_prefix_list(&s);
    // [*_~]+ -> ''
    s = remove_emphasis_chars(&s);
    // <\/?[^>]+> -> ' '
    s = strip_html_tags(&s);
    // &nbsp; -> ' '
    s = s.replace("&nbsp;", " ").replace("&NBSP;", " ");
    // case-insensitive &nbsp;
    s = replace_case_insensitive(&s, "&nbsp;", " ");
    // \s+ -> ' '
    s = collapse_whitespace(&s);
    s.trim().to_owned()
}

pub(super) fn normalize_markdown_to_text(value: &str) -> String {
    strip_markdown_to_text(value)
}

pub(super) fn normalize_markdown_for_comparison(value: &str) -> String {
    normalize_markdown_to_text(value).to_lowercase()
}

// --- regex-free implementations of each markdown transform ---

/// `!\[([^\]]*)\]\([^)]+\)` -> `$1`
pub(super) fn replace_image_links(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '!'
            && i + 1 < chars.len()
            && chars[i + 1] == '['
            && let Some((alt, consumed)) = parse_link_at(&chars, i + 1)
        {
            out.push_str(&alt);
            i += 1 + consumed;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// `\[([^\]]+)\]\([^)]+\)` -> `$1`. Note the label requires at least one char here.
pub(super) fn replace_text_links(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '['
            && let Some((label, consumed)) = parse_link_at(&chars, i)
            && !label.is_empty()
        {
            out.push_str(&label);
            i += consumed;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// Parses `[label](url)` starting at `[` (index `start`). Returns `(label, chars_consumed)`.
/// `label` is `[^\]]*`, `url` is `[^)]+` (at least one char).
pub(super) fn parse_link_at(chars: &[char], start: usize) -> Option<(String, usize)> {
    if start >= chars.len() || chars[start] != '[' {
        return None;
    }
    let mut i = start + 1;
    let mut label = String::new();
    while i < chars.len() && chars[i] != ']' {
        label.push(chars[i]);
        i += 1;
    }
    if i >= chars.len() || chars[i] != ']' {
        return None;
    }
    i += 1; // consume ]
    if i >= chars.len() || chars[i] != '(' {
        return None;
    }
    i += 1; // consume (
    let url_start = i;
    while i < chars.len() && chars[i] != ')' {
        i += 1;
    }
    if i >= chars.len() || chars[i] != ')' || i == url_start {
        // url must be at least one char ([^)]+)
        return None;
    }
    i += 1; // consume )
    Some((label, i - start))
}

/// `` `{3}[\s\S]*?`{3} `` -> ` ` (non-greedy fenced code).
pub(super) fn replace_fenced_code(input: &str) -> String {
    let mut out = String::new();
    let mut rest = input;
    while let Some(open) = rest.find("```") {
        out.push_str(&rest[..open]);
        let after_open = &rest[open + 3..];
        if let Some(close) = after_open.find("```") {
            out.push(' ');
            rest = &after_open[close + 3..];
        } else {
            // No closing fence: leave the opener as-is.
            out.push_str(&rest[open..]);
            rest = "";
        }
    }
    out.push_str(rest);
    out
}

/// `` `([^`]*)` `` -> `$1` (single backtick spans).
pub(super) fn replace_inline_code(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '`' {
            // find next backtick
            if let Some(end) = chars[i + 1..].iter().position(|c| *c == '`') {
                let inner: String = chars[i + 1..i + 1 + end].iter().collect();
                out.push_str(&inner);
                i = i + 1 + end + 1;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

pub(super) fn for_each_line<F: Fn(&str) -> String>(input: &str, f: F) -> String {
    // JS multiline `^` matches after every `\n`. Preserve original line separators.
    let mut out = String::new();
    let mut first = true;
    for line in input.split('\n') {
        if !first {
            out.push('\n');
        }
        first = false;
        out.push_str(&f(line));
    }
    out
}

/// `^#{1,6}\s+` per line -> ''
pub(super) fn strip_line_prefix_heading(input: &str) -> String {
    for_each_line(input, |line| {
        let chars: Vec<char> = line.chars().collect();
        let mut hashes = 0;
        while hashes < chars.len() && chars[hashes] == '#' {
            hashes += 1;
        }
        if (1..=6).contains(&hashes) && hashes < chars.len() && chars[hashes].is_whitespace() {
            let mut i = hashes;
            while i < chars.len() && chars[i].is_whitespace() {
                i += 1;
            }
            chars[i..].iter().collect()
        } else {
            line.to_owned()
        }
    })
}

/// `^\s*>\s?` per line -> ''
pub(super) fn strip_line_prefix_blockquote(input: &str) -> String {
    for_each_line(input, |line| {
        let chars: Vec<char> = line.chars().collect();
        let mut i = 0;
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i < chars.len() && chars[i] == '>' {
            i += 1;
            if i < chars.len() && chars[i].is_whitespace() {
                i += 1; // \s? optional single whitespace
            }
            chars[i..].iter().collect()
        } else {
            line.to_owned()
        }
    })
}

/// `^\s*([-*+]|\d+\.)\s+` per line -> ''
pub(super) fn strip_line_prefix_list(input: &str) -> String {
    for_each_line(input, |line| {
        let chars: Vec<char> = line.chars().collect();
        let mut i = 0;
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        let marker_start = i;
        let mut matched_marker = false;
        if i < chars.len() && matches!(chars[i], '-' | '*' | '+') {
            i += 1;
            matched_marker = true;
        } else {
            let digit_start = i;
            while i < chars.len() && chars[i].is_ascii_digit() {
                i += 1;
            }
            if i > digit_start && i < chars.len() && chars[i] == '.' {
                i += 1;
                matched_marker = true;
            } else {
                i = marker_start;
            }
        }
        if matched_marker && i < chars.len() && chars[i].is_whitespace() {
            while i < chars.len() && chars[i].is_whitespace() {
                i += 1;
            }
            chars[i..].iter().collect()
        } else {
            line.to_owned()
        }
    })
}

/// `[*_~]+` -> ''
pub(super) fn remove_emphasis_chars(input: &str) -> String {
    input
        .chars()
        .filter(|c| !matches!(c, '*' | '_' | '~'))
        .collect()
}

/// `<\/?[^>]+>` -> ' '
pub(super) fn strip_html_tags(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '<' {
            // optional '/'
            let mut j = i + 1;
            if j < chars.len() && chars[j] == '/' {
                j += 1;
            }
            // [^>]+ requires at least one non-'>' char
            let content_start = j;
            while j < chars.len() && chars[j] != '>' {
                j += 1;
            }
            if j < chars.len() && chars[j] == '>' && j > content_start {
                out.push(' ');
                i = j + 1;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

pub(super) fn replace_case_insensitive(input: &str, needle: &str, replacement: &str) -> String {
    if needle.is_empty() {
        return input.to_owned();
    }
    let lower_input = input.to_lowercase();
    let lower_needle = needle.to_lowercase();
    let mut out = String::new();
    let mut last = 0;
    let bytes_input: Vec<char> = input.chars().collect();
    // operate on char indices via lowercase string match positions; rebuild using char map
    // Simpler: byte-based since &nbsp; is ASCII.
    let _ = bytes_input;
    let mut search_from = 0;
    while let Some(pos) = lower_input[search_from..].find(&lower_needle) {
        let abs = search_from + pos;
        out.push_str(&input[last..abs]);
        out.push_str(replacement);
        last = abs + needle.len();
        search_from = last;
    }
    out.push_str(&input[last..]);
    out
}

/// `\s+` -> ' '
pub(super) fn collapse_whitespace(input: &str) -> String {
    let mut out = String::new();
    let mut in_ws = false;
    for c in input.chars() {
        if c.is_whitespace() {
            if !in_ws {
                out.push(' ');
                in_ws = true;
            }
        } else {
            out.push(c);
            in_ws = false;
        }
    }
    out
}
