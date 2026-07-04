// ---------------------------------------------------------------------------
// searchIntent port
// ---------------------------------------------------------------------------

/// A search candidate carrying the summary index it maps back to. `texts` are
/// the deduplicated trimmed strings searched (title, subtitle, aliases,
/// keywords).
pub(super) struct SearchCandidate {
    pub(super) index: usize,
    pub(super) texts: Vec<String>,
}

struct NormalizedText {
    compact: String,
    original: String,
    text: String,
    words: Vec<String>,
}

fn normalize_intent_text(value: &str) -> String {
    // JS: NFD normalize -> strip combining marks (̀-ͯ) -> lowercase
    // -> đ->d -> replace [^a-z0-9]+ with a single space -> trim/collapse.
    //
    // Rust std has no NFD normalizer and we must not add a dependency, so any
    // non-ASCII character (including precomposed accented Latin and Vietnamese
    // letters) collapses to a space here instead of decomposing to its base
    // letter. For ASCII inputs (the common case for workspace ids/names) this
    // matches JS exactly. See the structured-output notes for the divergence.
    let lowered = value.to_lowercase().replace('đ', "d");

    let mut out = String::new();
    let mut prev_space = false;
    for ch in lowered.chars() {
        if ch.is_ascii_lowercase() || ch.is_ascii_digit() {
            out.push(ch);
            prev_space = false;
        } else if !prev_space {
            out.push(' ');
            prev_space = true;
        }
    }

    out.trim().to_owned()
}

fn normalize(value: &str) -> NormalizedText {
    let text = normalize_intent_text(value);
    let words: Vec<String> = if text.is_empty() {
        Vec::new()
    } else {
        text.split(' ').map(ToOwned::to_owned).collect()
    };
    let compact = words.join("");

    NormalizedText {
        compact,
        original: value.to_owned(),
        text,
        words,
    }
}

fn get_intent_acronym(value: &str) -> String {
    normalize_intent_text(value)
        .split(' ')
        .filter(|word| !word.is_empty())
        .filter_map(|word| word.chars().next())
        .collect()
}

fn has_ordered_characters(text: &str, query: &str) -> bool {
    let query_chars: Vec<char> = query.chars().collect();
    let mut query_index = 0;
    for ch in text.chars() {
        if query_index >= query_chars.len() {
            break;
        }
        if ch == query_chars[query_index] {
            query_index += 1;
        }
    }
    query_index == query_chars.len()
}

fn ordered_character_score(text: &str, query: &str) -> i64 {
    let text_chars: Vec<char> = text.chars().collect();
    let query_chars: Vec<char> = query.chars().collect();
    let mut query_index = 0usize;
    let mut first_match: i64 = -1;
    let mut last_match: i64 = -1;
    let mut streak = 0i64;
    let mut longest_streak = 0i64;

    for (i, &ch) in text_chars.iter().enumerate() {
        if query_index >= query_chars.len() {
            break;
        }
        if ch == query_chars[query_index] {
            if first_match == -1 {
                first_match = i as i64;
            }
            last_match = i as i64;
            query_index += 1;
            streak += 1;
            longest_streak = longest_streak.max(streak);
        } else {
            streak = 0;
        }
    }

    if query_index != query_chars.len() || first_match == -1 || last_match == -1 {
        return 0;
    }

    let span = (last_match - first_match + 1).max(1);
    let density = query_chars.len() as f64 / span as f64;
    let prefix_bonus = if first_match == 0 {
        28
    } else {
        (18 - first_match).max(0)
    };
    let streak_bonus = (longest_streak * 8).min(40);

    (320.0 + density * 110.0 + prefix_bonus as f64 + streak_bonus as f64).round() as i64
}

fn bounded_levenshtein(a: &str, b: &str, max_distance: i64) -> i64 {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let a_len = a_chars.len() as i64;
    let b_len = b_chars.len() as i64;

    if (a_len - b_len).abs() > max_distance {
        return max_distance + 1;
    }
    if a_chars == b_chars {
        return 0;
    }
    if a_chars.is_empty() {
        return b_len;
    }
    if b_chars.is_empty() {
        return a_len;
    }

    let mut previous: Vec<i64> = (0..=b_chars.len() as i64).collect();
    let mut current: Vec<i64> = vec![0; b_chars.len() + 1];

    for i in 1..=a_chars.len() {
        current[0] = i as i64;
        let mut row_min = current[0];
        for j in 1..=b_chars.len() {
            let cost = if a_chars[i - 1] == b_chars[j - 1] {
                0
            } else {
                1
            };
            let deletion = previous[j] + 1;
            let insertion = current[j - 1] + 1;
            let substitution = previous[j - 1] + cost;
            current[j] = deletion.min(insertion).min(substitution);
            row_min = row_min.min(current[j]);
        }
        if row_min > max_distance {
            return max_distance + 1;
        }
        std::mem::swap(&mut previous, &mut current);
    }

    previous[b_chars.len()]
}

fn get_typo_limit(query_length: usize) -> i64 {
    if query_length < 4 {
        0
    } else if query_length < 8 {
        1
    } else {
        2
    }
}

const SHORT_QUERY_MAX_LENGTH: usize = 2;
const TYPO_DISTANCE_MAX_LENGTH: usize = 32;

fn score_text(text: &str, query: &NormalizedText) -> Option<i64> {
    let target = normalize(text);

    if query.text.is_empty() || query.compact.is_empty() || target.text.is_empty() {
        return None;
    }

    let is_short_query = query.compact.chars().count() <= SHORT_QUERY_MAX_LENGTH;
    let acronym = get_intent_acronym(&target.original);

    if target.text == query.text {
        return Some(10_000);
    }
    if target.compact == query.compact {
        return Some(9_700);
    }
    if target.text.starts_with(&query.text) {
        let diff = (target.text.chars().count() as i64 - query.text.chars().count() as i64).max(0);
        return Some(9_200 - diff.min(300));
    }
    if target.compact.starts_with(&query.compact) {
        let diff =
            (target.compact.chars().count() as i64 - query.compact.chars().count() as i64).max(0);
        return Some(8_900 - diff.min(300));
    }
    if acronym.starts_with(&query.compact) && !query.compact.is_empty() {
        let diff = (acronym.chars().count() as i64 - query.compact.chars().count() as i64).max(0);
        return Some(8_300 - diff.min(200));
    }

    if is_short_query {
        return None;
    }

    if target.text.contains(&query.text) || target.compact.contains(&query.compact) {
        let compact_index = char_index_of(&target.compact, &query.compact);
        let word_start = target
            .words
            .iter()
            .any(|word| word.starts_with(&query.text));
        let base = if word_start { 7_400 } else { 6_400 };
        return Some(base - compact_index.max(0));
    }

    if query.words.len() > 1
        && query.words.iter().all(|word| {
            target
                .words
                .iter()
                .any(|target_word| target_word.starts_with(word))
        })
    {
        return Some(7_700 - (target.words.len() as i64 * 20).min(500));
    }

    if has_ordered_characters(&target.compact, &query.compact) {
        return Some(ordered_character_score(&target.compact, &query.compact));
    }

    let typo_limit = get_typo_limit(query.compact.chars().count());
    if typo_limit > 0
        && target.compact.chars().count() <= TYPO_DISTANCE_MAX_LENGTH
        && query.compact.chars().count() <= TYPO_DISTANCE_MAX_LENGTH
    {
        let mut candidates: Vec<&str> = vec![target.compact.as_str()];
        candidates.extend(target.words.iter().map(String::as_str));
        let mut best_distance = typo_limit + 1;
        for candidate in candidates {
            if (candidate.chars().count() as i64 - query.compact.chars().count() as i64).abs()
                > typo_limit
            {
                continue;
            }
            best_distance =
                best_distance.min(bounded_levenshtein(candidate, &query.compact, typo_limit));
        }
        if best_distance <= typo_limit {
            return Some(6_900 - best_distance * 350);
        }
    }

    None
}

/// Returns the char index of `needle` in `haystack`, or -1 (mirrors JS
/// `String.indexOf`).
fn char_index_of(haystack: &str, needle: &str) -> i64 {
    if needle.is_empty() {
        return 0;
    }
    match haystack.find(needle) {
        Some(byte_index) => haystack[..byte_index].chars().count() as i64,
        None => -1,
    }
}

fn score_intent_candidate(candidate: &SearchCandidate, query: &NormalizedText) -> Option<i64> {
    if query.text.is_empty() {
        return Some(0);
    }
    let mut best: Option<i64> = None;
    for text in &candidate.texts {
        if let Some(score) = score_text(text, query)
            && best.is_none_or(|current| score > current)
        {
            best = Some(score);
        }
    }
    best
}

/// Runs the searchIntent ranking and returns the matching summary indices in
/// ranked order, capped at `limit`. `min_score` is 1 (the default).
pub(super) fn search_intent(
    candidates: &[SearchCandidate],
    query: &str,
    limit: usize,
) -> Vec<usize> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return candidates
            .iter()
            .take(limit)
            .map(|candidate| candidate.index)
            .collect();
    }

    let normalized_query = normalize(trimmed);
    let mut scored: Vec<(i64, usize, usize)> = Vec::new();
    for (position, candidate) in candidates.iter().enumerate() {
        if let Some(score) = score_intent_candidate(candidate, &normalized_query)
            && score >= 1
        {
            scored.push((score, position, candidate.index));
        }
    }

    // sort by score desc, then by original position asc.
    scored.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));

    scored
        .into_iter()
        .take(limit)
        .map(|(_, _, index)| index)
        .collect()
}
