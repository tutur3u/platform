use super::*;

// ---------------------------------------------------------------------------
// buildResponseSummary port.
// ---------------------------------------------------------------------------

pub(super) fn build_response_summary(responses: &[Value]) -> Value {
    use std::collections::BTreeSet;
    let mut responder_keys: BTreeSet<String> = BTreeSet::new();
    let mut authenticated_responders: BTreeSet<String> = BTreeSet::new();
    let mut duplicate_counts: BTreeMap<String, i64> = BTreeMap::new();
    let mut anonymous_submissions: i64 = 0;

    for response in responses {
        let respondent_user_id = response
            .get("respondent_user_id")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty());
        if let Some(user_id) = respondent_user_id {
            responder_keys.insert(format!("user:{user_id}"));
            authenticated_responders.insert(user_id.to_owned());
            *duplicate_counts.entry(user_id.to_owned()).or_insert(0) += 1;
            continue;
        }

        let respondent_email = response.get("respondent_email").and_then(Value::as_str);
        if let Some(email) = respondent_email
            && !email.trim().is_empty()
        {
            responder_keys.insert(format!("email:{}", email.trim().to_lowercase()));
            continue;
        }

        anonymous_submissions += 1;
        let id = response
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        responder_keys.insert(format!("anon:{id}"));
    }

    let duplicate_entries: Vec<i64> = duplicate_counts
        .values()
        .copied()
        .filter(|count| *count > 1)
        .collect();

    json!({
        "totalSubmissions": responses.len(),
        "totalResponders": responder_keys.len(),
        "authenticatedResponders": authenticated_responders.len(),
        "anonymousSubmissions": anonymous_submissions,
        "duplicateAuthenticatedResponders": duplicate_entries.len(),
        "duplicateAuthenticatedSubmissions": duplicate_entries.iter().sum::<i64>(),
        "hasMultipleSubmissionsByUser": !duplicate_entries.is_empty(),
    })
}

// ---------------------------------------------------------------------------
// buildQuestionAnalytics port.
// ---------------------------------------------------------------------------

pub(super) fn to_percentage(count: i64, total: i64) -> i64 {
    if total == 0 {
        0
    } else {
        // Math.round((count * 100) / total)
        ((count as f64 * 100.0) / total as f64).round() as i64
    }
}

pub(super) struct QuestionAccumulator {
    total_answers: i64,
    counts: BTreeMap<String, i64>,
    unmatched_counts: BTreeMap<String, i64>,
    text_counts: Vec<TextCount>, // preserves first-seen insertion order
    numeric_scores: Vec<f64>,
}

pub(super) struct TextCount {
    normalized: String,
    value: String,
    count: i64,
}

impl QuestionAccumulator {
    pub(super) fn new() -> Self {
        Self {
            total_answers: 0,
            counts: BTreeMap::new(),
            unmatched_counts: BTreeMap::new(),
            text_counts: Vec::new(),
            numeric_scores: Vec::new(),
        }
    }

    pub(super) fn increment_text(&mut self, value: &str) {
        let normalized = value.trim().to_lowercase();
        if let Some(existing) = self
            .text_counts
            .iter_mut()
            .find(|t| t.normalized == normalized)
        {
            existing.count += 1;
            return;
        }
        self.text_counts.push(TextCount {
            normalized,
            value: value.to_owned(),
            count: 1,
        });
    }
}

pub(super) fn increment(counts: &mut BTreeMap<String, i64>, key: &str) {
    *counts.entry(key.to_owned()).or_insert(0) += 1;
}

pub(super) fn build_question_analytics(
    definition: &FormDefinition,
    answer_rows: &[Value],
) -> Value {
    // questions = answerable questions, in section/question order.
    let answerable: Vec<&DefQuestion> = definition
        .questions_flat
        .iter()
        .filter(|q| is_answerable_question_type(&q.question_type))
        .collect();

    // accumulator keyed by question id.
    let mut accumulators: BTreeMap<String, QuestionAccumulator> = BTreeMap::new();
    for question in &answerable {
        accumulators.insert(question.id.clone(), QuestionAccumulator::new());
    }

    let resolver = StoredAnswerQuestionResolver::new(definition);

    for answer in answer_rows {
        let Some(question) = resolver.resolve(answer) else {
            continue;
        };
        if !accumulators.contains_key(&question.id) {
            continue;
        }

        let raw_value = extract_stored_answer_value(answer);
        if !has_answer_value(raw_value.as_ref()) {
            continue;
        }
        let raw_value = raw_value.expect("checked");

        let restored = restore_answer_for_question(Some(question), &raw_value);

        let acc = accumulators
            .get_mut(&question.id)
            .expect("accumulator present");
        acc.total_answers += 1;

        match question.question_type.as_str() {
            "multiple_choice" => {
                let resolved_values = match &restored.value {
                    RestoredValue::List(values) => values.clone(),
                    _ => Vec::new(),
                };
                for value in &resolved_values {
                    increment(&mut acc.counts, value);
                }
                for value in &restored.unresolved_values {
                    increment(&mut acc.unmatched_counts, value);
                }
            }
            "short_text" | "long_text" => {
                if let AnswerValue::Text(text) = &raw_value
                    && !text.trim().is_empty()
                {
                    acc.increment_text(text.trim());
                }
            }
            "single_choice" | "dropdown" => {
                let resolved_scalar = restored_scalar(&restored.value);
                if let Some(scalar) = &resolved_scalar {
                    increment(&mut acc.counts, scalar);
                }
                for value in &restored.unresolved_values {
                    increment(&mut acc.unmatched_counts, value);
                }
            }
            "rating" | "linear_scale" => {
                let resolved_scalar = restored_scalar(&restored.value);
                let has_matching_scale_option = resolved_scalar
                    .as_ref()
                    .map(|scalar| question.options.iter().any(|o| &o.value == scalar))
                    .unwrap_or(false);

                if let Some(scalar) = &resolved_scalar {
                    if has_matching_scale_option {
                        increment(&mut acc.counts, scalar);
                    } else {
                        increment(&mut acc.unmatched_counts, scalar);
                    }
                    if let Ok(numeric) = scalar.parse::<f64>()
                        && !numeric.is_nan()
                    {
                        acc.numeric_scores.push(numeric);
                    }
                }

                for value in &restored.unresolved_values {
                    if resolved_scalar.as_deref() != Some(value.as_str()) {
                        increment(&mut acc.unmatched_counts, value);
                    }
                }
            }
            _ => {}
        }
    }

    let analytics: Vec<Value> = answerable
        .iter()
        .map(|question| {
            let acc = accumulators.get(&question.id);
            let total_answers = acc.map(|a| a.total_answers).unwrap_or(0);

            let mut obj = Map::new();
            obj.insert("questionId".to_owned(), json!(question.id));
            obj.insert(
                "title".to_owned(),
                json!(normalize_markdown_to_text(
                    question.title.as_deref().unwrap_or("")
                )),
            );
            obj.insert("type".to_owned(), json!(question.question_type));
            obj.insert("totalAnswers".to_owned(), json!(total_answers));

            if matches!(
                question.question_type.as_str(),
                "single_choice" | "multiple_choice" | "dropdown"
            ) {
                let choices: Vec<Value> = question
                    .options
                    .iter()
                    .map(|option| {
                        let count = acc
                            .and_then(|a| a.counts.get(&option.value).copied())
                            .unwrap_or(0);
                        json!({
                            "label": normalize_markdown_to_text(&option.label),
                            "value": option.value,
                            "count": count,
                            "percentage": to_percentage(count, total_answers),
                        })
                    })
                    .collect();
                obj.insert("choices".to_owned(), Value::Array(choices));
            }

            if is_scale_type(&question.question_type) {
                let scale: Vec<Value> = question
                    .options
                    .iter()
                    .map(|option| {
                        let count = acc
                            .and_then(|a| a.counts.get(&option.value).copied())
                            .unwrap_or(0);
                        json!({
                            "score": option.value,
                            "label": normalize_markdown_to_text(&option.label),
                            "count": count,
                            "percentage": to_percentage(count, total_answers),
                        })
                    })
                    .collect();
                obj.insert("scale".to_owned(), Value::Array(scale));

                let numeric_scores = acc.map(|a| a.numeric_scores.as_slice()).unwrap_or(&[]);
                if !numeric_scores.is_empty() {
                    let total_score: f64 = numeric_scores.iter().sum();
                    let mean = total_score / numeric_scores.len() as f64;
                    obj.insert("meanScore".to_owned(), round_one_decimal(mean));
                }
            }

            if let Some(acc) = acc {
                if !acc.unmatched_counts.is_empty() {
                    obj.insert(
                        "unmatchedAnswers".to_owned(),
                        sort_unmatched_answers(&acc.unmatched_counts, total_answers),
                    );
                }
                if !acc.text_counts.is_empty() {
                    obj.insert(
                        "textResponses".to_owned(),
                        sort_text_responses(&acc.text_counts, total_answers),
                    );
                }
            }

            Value::Object(obj)
        })
        .collect();

    Value::Array(analytics)
}

pub(super) fn restored_scalar(value: &RestoredValue) -> Option<String> {
    match value {
        RestoredValue::Text(text) => Some(text.clone()),
        _ => None,
    }
}

/// `Number((value).toFixed(1))` — rounds to one decimal, drops a trailing `.0`.
pub(super) fn round_one_decimal(value: f64) -> Value {
    let rounded = (value * 10.0).round() / 10.0;
    if rounded.fract() == 0.0 && rounded.is_finite() {
        json!(rounded as i64)
    } else {
        serde_json::Number::from_f64(rounded)
            .map(Value::Number)
            .unwrap_or(Value::Null)
    }
}

pub(super) fn sort_unmatched_answers(counts: &BTreeMap<String, i64>, total: i64) -> Value {
    // sort by count desc, then key asc (localeCompare ~ byte order for our keys).
    let mut entries: Vec<(&String, &i64)> = counts.iter().collect();
    entries.sort_by(|left, right| right.1.cmp(left.1).then_with(|| left.0.cmp(right.0)));
    let out: Vec<Value> = entries
        .into_iter()
        .map(|(value, count)| {
            json!({
                "value": value,
                "count": count,
                "percentage": to_percentage(*count, total),
            })
        })
        .collect();
    Value::Array(out)
}

pub(super) fn sort_text_responses(counts: &[TextCount], total: i64) -> Value {
    // sort by count desc, then value asc.
    let mut entries: Vec<&TextCount> = counts.iter().collect();
    entries.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.value.cmp(&right.value))
    });
    let out: Vec<Value> = entries
        .into_iter()
        .map(|entry| {
            json!({
                "value": entry.value,
                "count": entry.count,
                "percentage": to_percentage(entry.count, total),
            })
        })
        .collect();
    Value::Array(out)
}

pub(super) fn is_answerable_question_type(question_type: &str) -> bool {
    matches!(
        question_type,
        "short_text"
            | "long_text"
            | "single_choice"
            | "multiple_choice"
            | "dropdown"
            | "linear_scale"
            | "rating"
            | "date"
            | "time"
    )
}
