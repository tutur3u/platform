use super::*;

// ---------------------------------------------------------------------------
// Data models for response records, export columns, and form definitions.
// ---------------------------------------------------------------------------

pub(super) struct ResponseRecord {
    pub(super) submitted_at: String,
    pub(super) responder: String,
    /// answers keyed by normalized question title (mirrors `listFormResponses`).
    pub(super) answers: HashMap<String, String>,
}

pub(super) struct ExportColumn {
    pub(super) key: String,
    pub(super) label: String,
}

#[derive(Clone)]
pub(super) struct DefinitionQuestion {
    pub(super) id: String,
    pub(super) type_: String,
    pub(super) title: String,
    pub(super) options: Vec<DefinitionOption>,
}

#[derive(Clone)]
pub(super) struct DefinitionOption {
    pub(super) label: String,
    pub(super) value: String,
}

pub(super) struct DefinitionSection {
    pub(super) questions: Vec<DefinitionQuestion>,
}

pub(super) struct FormDefinition {
    pub(super) ws_id: Option<String>,
    pub(super) sections: Vec<DefinitionSection>,
}

/// Mirrors `extractStoredAnswerValue`: text wins; else number; else string array.
pub(super) enum StoredAnswerValue {
    None,
    Text(String),
    Number(f64),
    List(Vec<String>),
}

// ---------------------------------------------------------------------------
// StoredAnswerResolver (mirrors `createStoredAnswerQuestionResolver`).
// ---------------------------------------------------------------------------

pub(super) struct StoredAnswerResolver<'a> {
    by_id: HashMap<&'a str, &'a DefinitionQuestion>,
    by_title_and_type: HashMap<String, Vec<&'a DefinitionQuestion>>,
}

impl<'a> StoredAnswerResolver<'a> {
    pub(super) fn new(definition: &'a FormDefinition) -> Self {
        let mut by_id: HashMap<&str, &DefinitionQuestion> = HashMap::new();
        let mut by_title_and_type: HashMap<String, Vec<&DefinitionQuestion>> = HashMap::new();

        for section in &definition.sections {
            for question in &section.questions {
                by_id.insert(question.id.as_str(), question);
                let key = format!(
                    "{}::{}",
                    question.type_,
                    normalize_stored_question_title(&question.title)
                );
                by_title_and_type.entry(key).or_default().push(question);
            }
        }

        Self {
            by_id,
            by_title_and_type,
        }
    }

    pub(super) fn resolve(&self, answer: &Value) -> Option<&'a DefinitionQuestion> {
        if let Some(question_id) = answer
            .get("question_id")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            && let Some(question) = self.by_id.get(question_id)
        {
            return Some(*question);
        }

        let title_key = normalize_stored_question_title(
            answer
                .get("question_title")
                .and_then(Value::as_str)
                .unwrap_or(""),
        );
        let question_type = answer
            .get("question_type")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())?;
        if title_key.is_empty() {
            return None;
        }

        let lookup_key = format!("{question_type}::{title_key}");
        match self.by_title_and_type.get(&lookup_key) {
            Some(matches) if matches.len() == 1 => Some(matches[0]),
            _ => None,
        }
    }
}
