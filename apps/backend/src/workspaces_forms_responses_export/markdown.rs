// ---------------------------------------------------------------------------
// Markdown stripping (best-effort port of `stripMarkdownToText`).
// ---------------------------------------------------------------------------

/// Best-effort port of `stripMarkdownToText`. The JS original applies a chain of regex
/// replacements; this strips the most common markdown markers, HTML tags, and collapses
/// whitespace. Plain text passes through unchanged (the common case for titles/labels).
pub(super) fn normalize_markdown_to_text(value: &str) -> String {
    let mut text = value.to_owned();

    // Drop HTML tags.
    text = strip_html_tags(&text);
    // Replace &nbsp; entities.
    text = text.replace("&nbsp;", " ").replace("&NBSP;", " ");
    // Strip common inline emphasis / heading / quote / list markers and code ticks.
    text = strip_inline_markers(&text);
    // Collapse whitespace runs to single spaces and trim.
    collapse_whitespace(&text)
}

pub(super) fn strip_html_tags(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut in_tag = false;
    for ch in value.chars() {
        match ch {
            '<' => {
                in_tag = true;
                out.push(' ');
            }
            '>' if in_tag => in_tag = false,
            _ if in_tag => {}
            _ => out.push(ch),
        }
    }
    out
}

pub(super) fn strip_inline_markers(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for line in value.split('\n') {
        let mut line_str = line.to_owned();
        // Heading markers at line start: `#{1,6}␠`.
        line_str = strip_line_prefix_hashes(&line_str);
        // Blockquote `>` at line start.
        let trimmed = line_str.trim_start();
        if let Some(rest) = trimmed.strip_prefix('>') {
            line_str = rest.trim_start().to_owned();
        }
        // List markers `- `, `* `, `+ `, `1. ` at line start.
        line_str = strip_list_marker(&line_str);
        // Emphasis markers `*`, `_`, `~`.
        line_str = line_str.replace(['*', '_', '~'], "");
        // Inline code backticks.
        line_str = line_str.replace('`', "");
        out.push_str(&line_str);
        out.push('\n');
    }
    out
}

pub(super) fn strip_line_prefix_hashes(line: &str) -> String {
    let trimmed_start = line.trim_start();
    let hashes = trimmed_start.chars().take_while(|c| *c == '#').count();
    if (1..=6).contains(&hashes) {
        let rest = &trimmed_start[hashes..];
        if rest.starts_with(' ') || rest.starts_with('\t') {
            return rest.trim_start().to_owned();
        }
    }
    line.to_owned()
}

pub(super) fn strip_list_marker(line: &str) -> String {
    let trimmed = line.trim_start();
    // Unordered list markers.
    for marker in ['-', '*', '+'] {
        if let Some(rest) = trimmed.strip_prefix(marker)
            && rest.starts_with(' ')
        {
            return rest.trim_start().to_owned();
        }
    }
    // Ordered list marker `\d+. `.
    let digits = trimmed.chars().take_while(|c| c.is_ascii_digit()).count();
    if digits > 0 {
        let rest = &trimmed[digits..];
        if let Some(after_dot) = rest.strip_prefix(". ") {
            return after_dot.trim_start().to_owned();
        }
        if let Some(after_dot) = rest.strip_prefix(".\t") {
            return after_dot.trim_start().to_owned();
        }
    }
    line.to_owned()
}

pub(super) fn collapse_whitespace(value: &str) -> String {
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
    out.trim().to_owned()
}
