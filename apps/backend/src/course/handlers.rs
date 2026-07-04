use super::*;

// ─── Main dispatch ────────────────────────────────────────────────────────────

pub(super) async fn course_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Authenticate the caller. The legacy route allows app-session auth via
    // `resolveSessionAuthContext({ allowAppSessionAuth: true })`; here we use the
    // standard supabase access-token path (bearer or supabase auth cookie). See
    // module/integration notes: app-session-only callers are not supported by
    // this port.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let course_id = query_param(request.url, "courseId");
    let ws_id = query_param(request.url, "wsId");
    let student_id = query_param(request.url, "studentId");

    if let Some(course_id) = course_id.as_deref() {
        return handle_course_detail(
            contact_data,
            outbound,
            course_id,
            student_id.as_deref(),
            &user_id,
            &access_token,
        )
        .await;
    }

    if let Some(ws_id) = ws_id.as_deref() {
        return handle_course_list(
            contact_data,
            outbound,
            ws_id,
            student_id.as_deref(),
            &user_id,
            &access_token,
        )
        .await;
    }

    error_message_response(400, "Provide either courseId or wsId query param")
}

// ─── List all courses for a workspace ────────────────────────────────────────

pub(super) async fn handle_course_list(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_id: Option<&str>,
    user_id: &str,
    access_token: &str,
) -> BackendResponse {
    // ListQuerySchema: wsId.min(1), studentId.optional().guid()
    if ws_id.is_empty() {
        return invalid_param_response("Invalid wsId");
    }
    if let Some(student_id) = student_id
        && !is_uuid_literal(student_id)
    {
        return invalid_param_response("Invalid wsId");
    }

    let subject = match resolve_tulearn_subject(
        contact_data,
        outbound,
        ws_id,
        student_id,
        user_id,
        access_token,
    )
    .await
    {
        Ok(subject) => subject,
        Err(SubjectError::Access { status, message }) => {
            return tulearn_access_response(status, &message);
        }
        Err(SubjectError::Internal) => {
            return error_message_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
        }
    };

    match get_learner_course_summaries(
        contact_data,
        outbound,
        &subject.ws_id,
        &subject.student_platform_user_id,
        &subject.student_workspace_user_id,
    )
    .await
    {
        Ok(courses) => no_store_response(json_response(200, json!({ "courses": courses }))),
        Err(()) => error_message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }
}

// ─── Course detail ───────────────────────────────────────────────────────────

pub(super) async fn handle_course_detail(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
    student_id: Option<&str>,
    user_id: &str,
    access_token: &str,
) -> BackendResponse {
    // DetailQuerySchema: courseId.guid(), studentId.optional().guid()
    if !is_uuid_literal(course_id) {
        return invalid_param_response("Invalid courseId");
    }
    if let Some(student_id) = student_id
        && !is_uuid_literal(student_id)
    {
        return invalid_param_response("Invalid courseId");
    }

    let group_id = course_id;

    // Fetch the published course group (service role).
    let group = match fetch_course_group(contact_data, outbound, group_id).await {
        Ok(Some(group)) => group,
        Ok(None) => return error_message_response(404, "Course not found"),
        Err(()) => {
            return error_message_response_with_code(
                500,
                "Failed to load course content",
                "course_group_lookup_failed",
            );
        }
    };
    let ws_id = group.ws_id;

    let mut has_access = false;
    let mut learner_modules: Vec<LearnerModuleSummary> = Vec::new();

    // 1) Explicit studentId -> resolve subject + learner detail.
    if let Some(student_id) = student_id {
        let subject = match resolve_tulearn_subject(
            contact_data,
            outbound,
            &ws_id,
            Some(student_id),
            user_id,
            access_token,
        )
        .await
        {
            Ok(subject) => subject,
            Err(SubjectError::Access { status, message }) => {
                return tulearn_access_response(status, &message);
            }
            Err(SubjectError::Internal) => {
                return error_message_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
            }
        };

        match get_learner_course_detail(
            contact_data,
            outbound,
            group_id,
            &subject.ws_id,
            &subject.student_platform_user_id,
            &subject.student_workspace_user_id,
        )
        .await
        {
            Ok(Some(detail)) => {
                learner_modules = detail.modules;
                has_access = true;
            }
            Ok(None) => return error_message_response(404, "Course not found"),
            Err(()) => return error_message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        }
    }

    // 2) Self student (the platform user is a learner in this workspace).
    if !has_access {
        match resolve_student_for_platform_user(contact_data, outbound, user_id, &ws_id).await {
            Ok(Some(self_student)) => {
                match get_learner_course_detail(
                    contact_data,
                    outbound,
                    group_id,
                    &ws_id,
                    user_id,
                    &self_student.workspace_user_id,
                )
                .await
                {
                    Ok(Some(detail)) => {
                        learner_modules = detail.modules;
                        has_access = true;
                    }
                    Ok(None) => return error_message_response(404, "Course not found"),
                    Err(()) => return error_message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
                }
            }
            Ok(None) => {}
            Err(()) => return error_message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        }
    }

    // 3) Guest course permission fallback (caller session / RLS).
    if !has_access {
        match guest_has_course_access(
            contact_data,
            outbound,
            &ws_id,
            user_id,
            group_id,
            access_token,
        )
        .await
        {
            Ok(granted) => has_access = granted,
            Err(GuestError::Code(code)) => {
                return error_message_response_with_code(
                    500,
                    "Failed to load course content",
                    code,
                );
            }
        }
    }

    if !has_access {
        return error_message_response(403, "Forbidden");
    }

    // Fetch published modules (service role).
    let published_modules = match fetch_published_modules(contact_data, outbound, group_id).await {
        Ok(modules) => modules,
        Err(()) => {
            return error_message_response_with_code(
                500,
                "Failed to load course content",
                "course_modules_lookup_failed",
            );
        }
    };

    let module_ids: Vec<String> = published_modules
        .iter()
        .filter_map(|m| m.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    // Fetch quiz/flashcard/quiz-set counts (service role).
    let (quiz_count, flashcard_count, quiz_set_count) = if module_ids.is_empty() {
        (
            std::collections::HashMap::new(),
            std::collections::HashMap::new(),
            std::collections::HashMap::new(),
        )
    } else {
        let quizzes =
            match fetch_module_counts(contact_data, outbound, "course_module_quizzes", &module_ids)
                .await
            {
                Ok(counts) => counts,
                Err(()) => {
                    return error_message_response_with_code(
                        500,
                        "Failed to load course content",
                        "course_quizzes_lookup_failed",
                    );
                }
            };
        let flashcards = match fetch_module_counts(
            contact_data,
            outbound,
            "course_module_flashcards",
            &module_ids,
        )
        .await
        {
            Ok(counts) => counts,
            Err(()) => {
                return error_message_response_with_code(
                    500,
                    "Failed to load course content",
                    "course_flashcards_lookup_failed",
                );
            }
        };
        let quiz_sets = match fetch_module_counts(
            contact_data,
            outbound,
            "course_module_quiz_sets",
            &module_ids,
        )
        .await
        {
            Ok(counts) => counts,
            Err(()) => {
                return error_message_response_with_code(
                    500,
                    "Failed to load course content",
                    "course_quiz_sets_lookup_failed",
                );
            }
        };
        (quizzes, flashcards, quiz_sets)
    };

    // Map of learner module access by module id.
    let learner_by_id: std::collections::HashMap<String, LearnerModuleSummary> = learner_modules
        .into_iter()
        .map(|m| (m.id.clone(), m))
        .collect();

    let modules: Vec<Value> = published_modules
        .into_iter()
        .map(|module| {
            let module_id = module
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            let learner = learner_by_id.get(&module_id);
            let locked_flag = learner.map(|m| m.locked).unwrap_or(false);

            // Start from the full module object (spread `...module`).
            let mut out: Map<String, Value> = match module {
                Value::Object(map) => map,
                _ => Map::new(),
            };

            // completed: learnerModule?.completed (undefined => omitted in JSON).
            match learner {
                Some(m) => {
                    out.insert("completed".to_owned(), Value::Bool(m.completed));
                }
                None => {
                    out.remove("completed");
                }
            }

            // content: locked ? null : toRichTextContent(module.content)
            let content_value = out.remove("content").unwrap_or(Value::Null);
            out.insert(
                "content".to_owned(),
                if locked_flag {
                    Value::Null
                } else {
                    to_rich_text_content(content_value)
                },
            );

            // extra_content: locked ? null : module.extra_content
            if locked_flag {
                out.insert("extra_content".to_owned(), Value::Null);
            }

            // flashcards / quizzes / quizSets counts.
            let flashcards = learner
                .map(|m| m.counts_flashcards)
                .unwrap_or_else(|| flashcard_count.get(&module_id).copied().unwrap_or(0));
            let quizzes = learner
                .map(|m| m.counts_quizzes)
                .unwrap_or_else(|| quiz_count.get(&module_id).copied().unwrap_or(0));
            let quiz_sets = learner
                .map(|m| m.counts_quiz_sets)
                .unwrap_or_else(|| quiz_set_count.get(&module_id).copied().unwrap_or(0));
            out.insert("flashcards".to_owned(), json!(flashcards));
            out.insert("quizzes".to_owned(), json!(quizzes));
            out.insert("quizSets".to_owned(), json!(quiz_sets));

            // locked: learnerModule?.locked (undefined => omitted)
            match learner {
                Some(m) => {
                    out.insert("locked".to_owned(), Value::Bool(m.locked));
                }
                None => {
                    out.remove("locked");
                }
            }

            // youtube_links: locked ? null : module.youtube_links
            if locked_flag {
                out.insert("youtube_links".to_owned(), Value::Null);
            }

            Value::Object(out)
        })
        .collect();

    no_store_response(json_response(
        200,
        json!({
            "group": {
                "description": group.description,
                "name": group.name,
            },
            "modules": modules,
        }),
    ))
}
