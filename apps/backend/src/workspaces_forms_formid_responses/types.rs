use super::*;

// ---------------------------------------------------------------------------
// extractStoredAnswerValue port.
// ---------------------------------------------------------------------------

/// Mirrors `FormAnswerValue | null`: a string, a list of strings, or a number.
pub(super) enum AnswerValue {
    Text(String),
    List(Vec<String>),
    Number(f64),
}

pub(super) fn extract_stored_answer_value(answer: &Value) -> Option<AnswerValue> {
    if let Some(text) = answer.get("answer_text").and_then(Value::as_str)
        && !text.trim().is_empty()
    {
        return Some(AnswerValue::Text(text.to_owned()));
    }

    let answer_json = answer.get("answer_json");
    if let Some(array) = answer_json.and_then(Value::as_array) {
        let strings: Vec<String> = array
            .iter()
            .filter_map(|entry| entry.as_str().map(str::to_owned))
            .collect();
        return Some(AnswerValue::List(strings));
    }

    if let Some(number) = answer_json.and_then(Value::as_f64) {
        // serde treats integers/floats both as numbers; JS `typeof === 'number'`.
        if answer_json.map(Value::is_number).unwrap_or(false) {
            return Some(AnswerValue::Number(number));
        }
    }

    None
}

pub(super) fn has_answer_value(value: Option<&AnswerValue>) -> bool {
    match value {
        Some(AnswerValue::List(values)) => !values.is_empty(),
        Some(AnswerValue::Text(text)) => !text.trim().is_empty(),
        Some(AnswerValue::Number(_)) => true,
        None => false,
    }
}

// ---------------------------------------------------------------------------
// answer-utils.ts port — option definitions.
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub(super) struct DefOption {
    pub(super) label: String,
    pub(super) value: String,
}

#[derive(Clone)]
pub(super) struct DefQuestion {
    pub(super) id: String,
    pub(super) title: Option<String>,
    pub(super) question_type: String,
    pub(super) options: Vec<DefOption>,
}

// ---------------------------------------------------------------------------
// Form definition — shared across db, analytics, and the entry handler.
// ---------------------------------------------------------------------------

pub(super) struct FormDefinition {
    pub(super) id: String,
    pub(super) ws_id: Option<String>,
    /// Flat list of all questions across sections, in section-order then question-order,
    /// matching `form.sections.flatMap(s => s.questions)`.
    pub(super) questions_flat: Vec<DefQuestion>,
}

// ---------------------------------------------------------------------------
// createStoredAnswerQuestionResolver port.
// ---------------------------------------------------------------------------

pub(super) struct StoredAnswerQuestionResolver<'a> {
    by_id: BTreeMap<String, &'a DefQuestion>,
    by_title_and_type: BTreeMap<String, Vec<&'a DefQuestion>>,
}

impl<'a> StoredAnswerQuestionResolver<'a> {
    pub(super) fn new(definition: &'a FormDefinition) -> Self {
        let mut by_id = BTreeMap::new();
        let mut by_title_and_type: BTreeMap<String, Vec<&'a DefQuestion>> = BTreeMap::new();
        for question in &definition.questions_flat {
            by_id.insert(question.id.clone(), question);
            let key = format!(
                "{}::{}",
                question.question_type,
                normalize_stored_question_title(question.title.as_deref())
            );
            by_title_and_type.entry(key).or_default().push(question);
        }
        Self {
            by_id,
            by_title_and_type,
        }
    }

    pub(super) fn resolve(&self, answer: &Value) -> Option<&'a DefQuestion> {
        if let Some(question_id) = answer.get("question_id").and_then(Value::as_str)
            && !question_id.is_empty()
            && let Some(matched) = self.by_id.get(question_id)
        {
            return Some(*matched);
        }

        let title_key =
            normalize_stored_question_title(answer.get("question_title").and_then(Value::as_str));
        let question_type = answer.get("question_type").and_then(Value::as_str);
        if title_key.is_empty() || question_type.is_none() {
            return None;
        }
        let question_type = question_type.expect("checked");
        if question_type.is_empty() {
            return None;
        }

        let key = format!("{question_type}::{title_key}");
        match self.by_title_and_type.get(&key) {
            Some(matches) if matches.len() == 1 => Some(matches[0]),
            _ => None,
        }
    }
}

pub(super) fn normalize_stored_question_title(title: Option<&str>) -> String {
    normalize_markdown_for_comparison(title.unwrap_or(""))
}
