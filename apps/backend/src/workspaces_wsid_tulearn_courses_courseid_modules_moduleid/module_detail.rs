use super::*;

// ---------------------------------------------------------------------------
// Module detail fetch (mirrors getLearnerModuleDetail's four parallel reads)
// ---------------------------------------------------------------------------

pub(super) struct ModuleDetail {
    pub(super) content: Value,
    pub(super) extra_content: Value,
    pub(super) youtube_links: Value,
    pub(super) flashcards: Vec<Value>,
    pub(super) quizzes: Vec<Value>,
    pub(super) quiz_sets: Vec<Value>,
}

#[derive(Deserialize)]
struct ModuleContentRow {
    content: Option<Value>,
    extra_content: Option<Value>,
    youtube_links: Option<Value>,
}

#[derive(Deserialize)]
struct FlashcardJoinRow {
    workspace_flashcards: Option<Value>,
}

#[derive(Deserialize)]
struct QuizJoinRow {
    workspace_quizzes: Option<Value>,
}

#[derive(Deserialize)]
struct QuizSetJoinRow {
    workspace_quiz_sets: Option<Value>,
}

pub(super) async fn fetch_module_detail(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    module_id: &str,
    course_id: &str,
) -> Result<ModuleDetail, ()> {
    // Content fields.
    let Some(content_url) = contact_data.rest_url(
        "workspace_course_modules",
        &[
            ("select", "content,extra_content,youtube_links".to_owned()),
            ("id", format!("eq.{module_id}")),
            ("group_id", format!("eq.{course_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let content_resp = service_role_get(contact_data, outbound, &content_url, None).await?;
    if !(200..300).contains(&content_resp.status) {
        return Err(());
    }
    let content_rows: Vec<ModuleContentRow> = content_resp.json().map_err(|_| ())?;
    let Some(content_row) = content_rows.into_iter().next() else {
        return Err(());
    };

    // Flashcards.
    let Some(flashcards_url) = contact_data.rest_url(
        "course_module_flashcards",
        &[
            ("select", "workspace_flashcards(id,front,back)".to_owned()),
            ("module_id", format!("eq.{module_id}")),
        ],
    ) else {
        return Err(());
    };
    let flashcards_resp = service_role_get(contact_data, outbound, &flashcards_url, None).await?;
    if !(200..300).contains(&flashcards_resp.status) {
        return Err(());
    }
    let flashcard_rows: Vec<FlashcardJoinRow> = flashcards_resp.json().map_err(|_| ())?;
    let flashcards: Vec<Value> = flashcard_rows
        .into_iter()
        .filter_map(|row| first_embed(row.workspace_flashcards))
        .collect();

    // Quizzes.
    let Some(quizzes_url) = contact_data.rest_url(
        "course_module_quizzes",
        &[
            (
                "select",
                "workspace_quizzes(id,question,type,content,score,quiz_options(id,value,explanation))".to_owned(),
            ),
            ("module_id", format!("eq.{module_id}")),
        ],
    ) else {
        return Err(());
    };
    let quizzes_resp = service_role_get(contact_data, outbound, &quizzes_url, None).await?;
    if !(200..300).contains(&quizzes_resp.status) {
        return Err(());
    }
    let quiz_rows: Vec<QuizJoinRow> = quizzes_resp.json().map_err(|_| ())?;
    let quizzes: Vec<Value> = quiz_rows
        .into_iter()
        .filter_map(|row| first_embed(row.workspace_quizzes))
        .map(sanitize_learner_quiz)
        .collect();

    // Quiz sets.
    let Some(quiz_sets_url) = contact_data.rest_url(
        "course_module_quiz_sets",
        &[
            ("select", "workspace_quiz_sets(id,name)".to_owned()),
            ("module_id", format!("eq.{module_id}")),
        ],
    ) else {
        return Err(());
    };
    let quiz_sets_resp = service_role_get(contact_data, outbound, &quiz_sets_url, None).await?;
    if !(200..300).contains(&quiz_sets_resp.status) {
        return Err(());
    }
    let quiz_set_rows: Vec<QuizSetJoinRow> = quiz_sets_resp.json().map_err(|_| ())?;
    let quiz_sets: Vec<Value> = quiz_set_rows
        .into_iter()
        .filter_map(|row| first_embed(row.workspace_quiz_sets))
        .collect();

    Ok(ModuleDetail {
        content: content_row.content.unwrap_or(Value::Null),
        extra_content: content_row.extra_content.unwrap_or(Value::Null),
        youtube_links: content_row.youtube_links.unwrap_or(Value::Null),
        flashcards,
        quizzes,
        quiz_sets,
    })
}

// ---------------------------------------------------------------------------
// Submissions fetch (mirrors the course_module_quiz_submissions query in GET)
// ---------------------------------------------------------------------------

pub(super) async fn fetch_submissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    module_id: &str,
    student_platform_user_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "course_module_quiz_submissions",
        &[
            (
                "select",
                "quiz_id,selected_option_id,answer,is_correct,created_at".to_owned(),
            ),
            ("module_id", format!("eq.{module_id}")),
            ("user_id", format!("eq.{student_platform_user_id}")),
            ("order", "created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Quiz sanitization (mirrors sanitizeLearnerQuiz from courses.ts)
// ---------------------------------------------------------------------------

/// Removes the `answer` field and sanitizes `content` for matching-type quizzes.
pub(super) fn sanitize_learner_quiz(mut quiz: Value) -> Value {
    let Some(obj) = quiz.as_object_mut() else {
        return quiz;
    };

    // Always strip the answer field (not present in LearnerQuiz).
    obj.remove("answer");

    let quiz_type = obj
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();

    if quiz_type == "matching" {
        let quiz_id = obj
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned();
        let content = obj.get("content").cloned().unwrap_or(Value::Null);
        let sanitized = matching_prompt_content(&quiz_id, &content);
        obj.insert("content".to_owned(), sanitized);
    }

    quiz
}

/// Mirrors `matchingPromptContent`: returns `{ choices, pairs }` where choices
/// are the right-side values shuffled by a deterministic hash and pairs expose
/// only the left-side prompts.
fn matching_prompt_content(quiz_id: &str, content: &Value) -> Value {
    let pairs = get_matching_pairs(content);
    let mut choices: Vec<(u32, String)> = pairs
        .iter()
        .enumerate()
        .map(|(index, pair)| (stable_choice_rank(quiz_id, &pair.1, index), pair.1.clone()))
        .collect();
    choices.sort_by_key(|(rank, _)| *rank);

    let choices_json: Vec<Value> = choices
        .into_iter()
        .map(|(_, value)| Value::String(value))
        .collect();

    let left_prompts: Vec<Value> = pairs
        .into_iter()
        .map(|(left, _)| json!({ "left": left }))
        .collect();

    json!({ "choices": choices_json, "pairs": left_prompts })
}

/// Extracts `(left, right)` pairs from a JSON value, mirroring
/// `getMatchingPairs` from `quiz-content.ts`.
pub(super) fn get_matching_pairs(value: &Value) -> Vec<(String, String)> {
    let arr = if let Some(arr) = value.as_array() {
        arr.as_slice()
    } else if let Some(obj) = value.as_object() {
        if let Some(Value::Array(pairs)) = obj.get("pairs") {
            pairs.as_slice()
        } else {
            return Vec::new();
        }
    } else {
        return Vec::new();
    };

    arr.iter()
        .filter_map(|pair| {
            let obj = pair.as_object()?;
            let left = obj.get("left")?.as_str()?.to_owned();
            let right = obj.get("right")?.as_str()?.to_owned();
            if left.is_empty() || right.is_empty() {
                None
            } else {
                Some((left, right))
            }
        })
        .collect()
}

/// Deterministic shuffle rank, mirrors `stableChoiceRank` in courses.ts.
///
/// JavaScript's `charCodeAt` returns UTF-16 code units. For BMP characters
/// (U+0000–U+FFFF) `char as u32` matches. Surrogate pairs (rare in quiz
/// content) would differ; see module-level doc comment.
pub(super) fn stable_choice_rank(quiz_id: &str, value: &str, index: usize) -> u32 {
    let input = format!("{quiz_id}:{value}:{index}");
    let mut hash: u32 = 0;
    for ch in input.chars() {
        hash = hash.wrapping_mul(31).wrapping_add(ch as u32);
    }
    hash
}
