use super::*;

// ---------------------------------------------------------------------------
// answer-utils.ts port (option matching + formatting + restoring).
// ---------------------------------------------------------------------------

pub(super) fn derive_option_value(label: &str) -> String {
    let lower = normalize_markdown_to_text(label).to_lowercase();
    // replace([^a-z0-9]+, '-')
    let mut replaced = String::new();
    let mut prev_dash = false;
    for c in lower.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            replaced.push(c);
            prev_dash = false;
        } else if !prev_dash {
            replaced.push('-');
            prev_dash = true;
        }
    }
    // replace(/^-+|-+$/g, '')
    let trimmed = replaced.trim_matches('-');
    if trimmed.is_empty() {
        "option".to_owned()
    } else {
        trimmed.to_owned()
    }
}

pub(super) fn legacy_option_index(candidate: &str) -> Option<usize> {
    let trimmed = candidate.trim();
    let rest = trimmed
        .strip_prefix("option-")
        .or_else(|| trimmed.strip_prefix("OPTION-"))
        .or_else(|| {
            // case-insensitive prefix "option-"
            if trimmed.len() >= 7 && trimmed[..7].eq_ignore_ascii_case("option-") {
                Some(&trimmed[7..])
            } else {
                None
            }
        })?;
    if rest.is_empty() || !rest.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let n: i64 = rest.parse().ok()?;
    let index = n - 1;
    if index < 0 {
        None
    } else {
        Some(index as usize)
    }
}

pub(super) fn find_matching_option<'a>(
    question: Option<&'a DefQuestion>,
    candidate: &str,
) -> Option<&'a DefOption> {
    let question = question?;
    if candidate.trim().is_empty() {
        return None;
    }

    let normalized_candidate = normalize_markdown_for_comparison(candidate);
    let derived_candidate = derive_option_value(candidate);

    if let Some(exact) = question.options.iter().find(|o| o.value == candidate) {
        return Some(exact);
    }

    if let Some(label_match) = question
        .options
        .iter()
        .find(|o| normalize_markdown_for_comparison(&o.label) == normalized_candidate)
    {
        return Some(label_match);
    }

    if let Some(derived_match) = question.options.iter().find(|o| {
        derive_option_value(&o.label) == derived_candidate || o.value == derived_candidate
    }) {
        return Some(derived_match);
    }

    legacy_option_index(candidate).and_then(|index| question.options.get(index))
}

pub(super) fn is_scale_type(question_type: &str) -> bool {
    matches!(question_type, "linear_scale" | "rating")
}

pub(super) fn format_matched_option_label(question: &DefQuestion, option: &DefOption) -> String {
    let plain = normalize_markdown_to_text(&option.label);
    if is_scale_type(&question.question_type) && plain.trim() != option.value.trim() {
        format!("{plain} ({})", option.value)
    } else {
        plain
    }
}

pub(super) struct FormattedAnswer {
    pub(super) value: String,
    #[allow(dead_code)]
    unresolved_values: Vec<String>,
}

pub(super) fn format_answer_for_question(
    question: Option<&DefQuestion>,
    answer: Option<&AnswerValue>,
) -> FormattedAnswer {
    // answer == null || answer === ''
    let empty = FormattedAnswer {
        value: "\u{2014}".to_owned(),
        unresolved_values: Vec::new(),
    };
    let Some(answer) = answer else {
        return empty;
    };
    match answer {
        AnswerValue::Text(text) => {
            if text.is_empty() {
                return empty;
            }
            if let Some(matched) = find_matching_option(question, text)
                && let Some(q) = question
            {
                return FormattedAnswer {
                    value: format_matched_option_label(q, matched),
                    unresolved_values: Vec::new(),
                };
            }
            let unresolved = match question {
                Some(q) if is_choice_or_scale_type(&q.question_type) => vec![text.clone()],
                _ => Vec::new(),
            };
            FormattedAnswer {
                value: text.clone(),
                unresolved_values: unresolved,
            }
        }
        AnswerValue::Number(number) => FormattedAnswer {
            value: stringify_number(*number),
            unresolved_values: Vec::new(),
        },
        AnswerValue::List(entries) => {
            let mut resolved_values: Vec<String> = Vec::new();
            let mut unresolved_values: Vec<String> = Vec::new();
            for entry in entries {
                match find_matching_option(question, entry) {
                    Some(matched) if question.is_some() => {
                        resolved_values.push(format_matched_option_label(
                            question.expect("question present"),
                            matched,
                        ));
                    }
                    _ => unresolved_values.push(entry.clone()),
                }
            }
            let mut all_values = resolved_values;
            all_values.extend(unresolved_values.iter().cloned());
            let value = if all_values.is_empty() {
                "\u{2014}".to_owned()
            } else {
                all_values.join(", ")
            };
            FormattedAnswer {
                value,
                unresolved_values,
            }
        }
    }
}

pub(super) fn is_choice_or_scale_type(question_type: &str) -> bool {
    matches!(
        question_type,
        "single_choice" | "multiple_choice" | "dropdown" | "linear_scale" | "rating"
    )
}

/// JS `String(number)` for the numeric forms produced here (integers + simple decimals).
pub(super) fn stringify_number(number: f64) -> String {
    if number.fract() == 0.0 && number.is_finite() {
        format!("{}", number as i64)
    } else {
        let mut s = format!("{number}");
        if s.contains('e') || s.contains('E') {
            s = number.to_string();
        }
        s
    }
}

/// Output of `restoreAnswerForQuestion`.
pub(super) enum RestoredValue {
    Undefined,
    Text(String),
    List(Vec<String>),
}

pub(super) struct Restored {
    pub(super) value: RestoredValue,
    pub(super) unresolved_values: Vec<String>,
}

pub(super) fn restore_answer_for_question(
    question: Option<&DefQuestion>,
    answer: &AnswerValue,
) -> Restored {
    let none = Restored {
        value: RestoredValue::Undefined,
        unresolved_values: Vec::new(),
    };
    let Some(question) = question else {
        return none;
    };
    // answer == null || answer === '' — an empty Text counts as ''.
    if let AnswerValue::Text(text) = answer
        && text.is_empty()
    {
        return none;
    }

    if question.question_type == "multiple_choice" {
        let raw_values: Vec<String> = match answer {
            AnswerValue::List(values) => values.clone(),
            AnswerValue::Text(text) => vec![text.clone()],
            AnswerValue::Number(_) => Vec::new(),
        };
        let mut resolved_values: Vec<String> = Vec::new();
        let mut unresolved_values: Vec<String> = Vec::new();
        for entry in &raw_values {
            match find_matching_option(Some(question), entry) {
                Some(matched) => resolved_values.push(matched.value.clone()),
                None => unresolved_values.push(entry.clone()),
            }
        }
        return Restored {
            value: if resolved_values.is_empty() {
                RestoredValue::Undefined
            } else {
                RestoredValue::List(resolved_values)
            },
            unresolved_values,
        };
    }

    if matches!(
        question.question_type.as_str(),
        "single_choice" | "dropdown" | "linear_scale" | "rating"
    ) {
        let raw_value = match answer {
            AnswerValue::Number(number) => stringify_number(*number),
            AnswerValue::Text(text) => text.clone(),
            AnswerValue::List(_) => String::new(),
        };
        match find_matching_option(Some(question), &raw_value) {
            Some(matched) => Restored {
                value: RestoredValue::Text(matched.value.clone()),
                unresolved_values: Vec::new(),
            },
            None => Restored {
                value: if is_scale_type(&question.question_type) {
                    RestoredValue::Text(raw_value.clone())
                } else {
                    RestoredValue::Undefined
                },
                unresolved_values: if raw_value.is_empty() {
                    Vec::new()
                } else {
                    vec![raw_value]
                },
            },
        }
    } else {
        // `return { value: answer, ... }`. For text questions the scalar string is kept.
        let value = match answer {
            AnswerValue::Text(text) => RestoredValue::Text(text.clone()),
            AnswerValue::Number(number) => RestoredValue::Text(stringify_number(*number)),
            AnswerValue::List(values) => RestoredValue::List(values.clone()),
        };
        Restored {
            value,
            unresolved_values: Vec::new(),
        }
    }
}
