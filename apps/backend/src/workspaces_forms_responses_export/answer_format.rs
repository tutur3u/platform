use super::*;

// ---------------------------------------------------------------------------
// Stored answer formatting (mirrors answer-utils.ts).
// ---------------------------------------------------------------------------

pub(super) fn extract_stored_answer_value(answer: &Value) -> StoredAnswerValue {
    if let Some(text) = answer.get("answer_text").and_then(Value::as_str)
        && !text.trim().is_empty()
    {
        return StoredAnswerValue::Text(text.to_owned());
    }

    if let Some(json_value) = answer.get("answer_json") {
        if let Some(array) = json_value.as_array() {
            let strings: Vec<String> = array
                .iter()
                .filter_map(|entry| entry.as_str().map(str::to_owned))
                .collect();
            return StoredAnswerValue::List(strings);
        }
        if let Some(number) = json_value.as_f64()
            && json_value.is_number()
        {
            return StoredAnswerValue::Number(number);
        }
    }

    StoredAnswerValue::None
}

/// Mirrors `formatAnswerForQuestion(question, value).value`.
pub(super) fn format_answer_for_question(
    question: Option<&DefinitionQuestion>,
    value: &StoredAnswerValue,
) -> String {
    match value {
        StoredAnswerValue::None => "—".to_owned(),
        StoredAnswerValue::Text(text) => {
            if text.is_empty() {
                return "—".to_owned();
            }
            match find_matching_option(question, text) {
                Some(option) if question.is_some() => {
                    format_matched_option_label(question.expect("checked"), option)
                }
                _ => text.clone(),
            }
        }
        StoredAnswerValue::Number(number) => stringify_number(*number),
        StoredAnswerValue::List(entries) => {
            let mut resolved: Vec<String> = Vec::new();
            let mut unresolved: Vec<String> = Vec::new();

            for entry in entries {
                match find_matching_option(question, entry) {
                    Some(option) if question.is_some() => {
                        resolved.push(format_matched_option_label(
                            question.expect("checked"),
                            option,
                        ));
                    }
                    _ => unresolved.push(entry.clone()),
                }
            }

            let mut all_values = resolved;
            all_values.extend(unresolved);

            if all_values.is_empty() {
                "—".to_owned()
            } else {
                all_values.join(", ")
            }
        }
    }
}

pub(super) fn find_matching_option<'a>(
    question: Option<&'a DefinitionQuestion>,
    candidate: &str,
) -> Option<&'a DefinitionOption> {
    let question = question?;
    if candidate.trim().is_empty() {
        return None;
    }

    let normalized_candidate = normalize_text(candidate);
    let derived_candidate = derive_option_value(candidate);

    if let Some(option) = question.options.iter().find(|o| o.value == candidate) {
        return Some(option);
    }
    if let Some(option) = question
        .options
        .iter()
        .find(|o| normalize_text(&o.label) == normalized_candidate)
    {
        return Some(option);
    }
    if let Some(option) = question.options.iter().find(|o| {
        derive_option_value(&o.label) == derived_candidate || o.value == derived_candidate
    }) {
        return Some(option);
    }

    if let Some(index) = legacy_option_index(candidate) {
        return question.options.get(index);
    }

    None
}

pub(super) fn format_matched_option_label(
    question: &DefinitionQuestion,
    option: &DefinitionOption,
) -> String {
    let plain_text_label = normalize_markdown_to_text(&option.label);

    if (question.type_ == "linear_scale" || question.type_ == "rating")
        && plain_text_label.trim() != option.value.trim()
    {
        return format!("{plain_text_label} ({})", option.value);
    }

    plain_text_label
}

/// Mirrors `getLegacyOptionIndex`: parses `option-<n>` / `option_<n>` shaped candidates.
pub(super) fn legacy_option_index(candidate: &str) -> Option<usize> {
    let trimmed = candidate.trim();
    let rest = trimmed
        .strip_prefix("option-")
        .or_else(|| trimmed.strip_prefix("option_"))?;
    rest.parse::<usize>().ok()
}

/// Mirrors `deriveOptionValue`: lowercases, trims, collapses non-alphanumerics to `-`.
pub(super) fn derive_option_value(label: &str) -> String {
    let lowered = normalize_markdown_to_text(label).to_lowercase();
    let mut out = String::new();
    let mut last_dash = false;
    for ch in lowered.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_owned()
}

/// Mirrors `normalizeText`: lowercased + whitespace-collapsed plain text.
pub(super) fn normalize_text(value: &str) -> String {
    normalize_markdown_to_text(value).to_lowercase()
}

/// Mirrors `normalizeStoredQuestionTitle`: normalized markdown text lowercased.
pub(super) fn normalize_stored_question_title(value: &str) -> String {
    normalize_markdown_to_text(value).to_lowercase()
}

pub(super) fn stringify_number(number: f64) -> String {
    if number.fract() == 0.0 && number.is_finite() {
        format!("{}", number as i64)
    } else {
        format!("{number}")
    }
}
