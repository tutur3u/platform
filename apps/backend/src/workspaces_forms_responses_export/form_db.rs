use super::*;

// ---------------------------------------------------------------------------
// Response record loading (RPC page + chunked answer/metadata fetch).
// ---------------------------------------------------------------------------

pub(super) async fn load_response_records(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    definition: &FormDefinition,
    form_id: &str,
    query: Option<&str>,
) -> Result<Vec<ResponseRecord>, ()> {
    // get_form_response_page (page 1, pageSize 5000) -> the visible rows.
    let page_rows = call_rpc(
        contact_data,
        outbound,
        RESPONSE_PAGE_RPC,
        &json!({
            "p_form_id": form_id,
            "p_query": query,
            "p_page_size": EXPORT_PAGE_SIZE,
            "p_page": 1,
        }),
    )
    .await?;

    // get_form_matched_response_ids -> ALL matched ids (used to fetch answers/metadata).
    let matched_rows = call_rpc(
        contact_data,
        outbound,
        MATCHED_RESPONSE_IDS_RPC,
        &json!({
            "p_form_id": form_id,
            "p_query": query,
        }),
    )
    .await?;

    let matched_ids: Vec<String> = matched_rows
        .iter()
        .filter_map(|row| {
            row.get("response_id")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .collect();

    // Fetch the answer rows for every matched response in chunks of 500.
    //
    // NOTE: the legacy route additionally fetches response metadata (email/user id) via
    // `fetchResponseMetadataByIds`, but only consumes it for the summary/analytics return
    // fields. The export rows take the responder column straight from the page RPC rows
    // (which already carry `respondent_email` / `respondent_user_id`), so the metadata
    // fetch is intentionally omitted here.
    let answer_rows = fetch_response_answers(contact_data, outbound, &matched_ids).await?;

    // answers grouped by response id.
    let mut answers_by_response: HashMap<String, Vec<&Value>> = HashMap::new();
    for row in &answer_rows {
        if let Some(response_id) = row.get("response_id").and_then(Value::as_str) {
            answers_by_response
                .entry(response_id.to_owned())
                .or_default()
                .push(row);
        }
    }

    let resolver = StoredAnswerResolver::new(definition);

    let records = page_rows
        .iter()
        .map(|response| {
            let id = response.get("id").and_then(Value::as_str).unwrap_or("");
            let submitted_at = response
                .get("submitted_at")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();

            // Responder column metadata comes from the page row directly (legacy maps it
            // onto the record from the same RPC row).
            let respondent_email = response
                .get("respondent_email")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty());
            let respondent_user_id = response
                .get("respondent_user_id")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty());
            let responder = respondent_email
                .or(respondent_user_id)
                .map(str::to_owned)
                .unwrap_or_else(|| "Anonymous".to_owned());

            let mut answers: HashMap<String, String> = HashMap::new();
            if let Some(rows) = answers_by_response.get(id) {
                for answer in rows {
                    let question = resolver.resolve(answer);
                    let raw_value = extract_stored_answer_value(answer);
                    let formatted = format_answer_for_question(question, &raw_value);

                    let question_title = question
                        .map(|q| q.title.as_str())
                        .filter(|t| !t.is_empty())
                        .or_else(|| {
                            answer
                                .get("question_title")
                                .and_then(Value::as_str)
                                .filter(|t| !t.is_empty())
                        });
                    let key_source = question_title.unwrap_or("");
                    let normalized = normalize_markdown_to_text(key_source);
                    let key = if normalized.is_empty() {
                        "Untitled question".to_owned()
                    } else {
                        normalized
                    };

                    answers.insert(key, formatted);
                }
            }

            ResponseRecord {
                submitted_at,
                responder,
                answers,
            }
        })
        .collect();

    Ok(records)
}

pub(super) async fn fetch_response_answers(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    response_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let mut out = Vec::new();
    for chunk in response_ids.chunks(CHUNK_SIZE) {
        if chunk.is_empty() {
            continue;
        }
        let in_filter = format!("in.({})", chunk.join(","));
        let rows = private_get(
            contact_data,
            outbound,
            "form_response_answers",
            &[("select", "*".to_owned()), ("response_id", in_filter)],
        )
        .await?;
        out.extend(rows);
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// Form definition fetch (private schema) -- mirrors workspaces_forms_export.rs.
// ---------------------------------------------------------------------------

pub(super) async fn fetch_form_definition(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    form_id: &str,
) -> Result<Option<FormDefinition>, ()> {
    let form_rows = private_get(
        contact_data,
        outbound,
        "forms",
        &[
            ("select", "ws_id".to_owned()),
            ("id", format!("eq.{form_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await?;
    let Some(form) = form_rows.into_iter().next() else {
        return Ok(None);
    };
    let ws_id = form.get("ws_id").and_then(Value::as_str).map(str::to_owned);

    let sections_raw = private_get(
        contact_data,
        outbound,
        "form_sections",
        &[
            ("select", "id, position".to_owned()),
            ("form_id", format!("eq.{form_id}")),
        ],
    )
    .await?;
    let questions_raw = private_get(
        contact_data,
        outbound,
        "form_questions",
        &[
            ("select", "id, section_id, type, title, position".to_owned()),
            ("form_id", format!("eq.{form_id}")),
        ],
    )
    .await?;

    let question_ids: Vec<String> = questions_raw
        .iter()
        .filter_map(|q| q.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();
    let options_raw = if question_ids.is_empty() {
        Vec::new()
    } else {
        let in_filter = format!("in.({})", question_ids.join(","));
        private_get(
            contact_data,
            outbound,
            "form_question_options",
            &[
                ("select", "question_id, label, value, position".to_owned()),
                ("question_id", in_filter),
            ],
        )
        .await?
    };

    // options keyed by question id, sorted by position.
    let mut options_by_question: HashMap<String, Vec<(i64, DefinitionOption)>> = HashMap::new();
    for option in &options_raw {
        let Some(question_id) = option.get("question_id").and_then(Value::as_str) else {
            continue;
        };
        let position = option.get("position").and_then(Value::as_i64).unwrap_or(0);
        options_by_question
            .entry(question_id.to_owned())
            .or_default()
            .push((
                position,
                DefinitionOption {
                    label: option
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_owned(),
                    value: option
                        .get("value")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_owned(),
                },
            ));
    }

    // questions keyed by section id, sorted by position.
    let mut questions_by_section: HashMap<String, Vec<(i64, DefinitionQuestion)>> = HashMap::new();
    for question in &questions_raw {
        let Some(section_id) = question.get("section_id").and_then(Value::as_str) else {
            continue;
        };
        let id = question
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned();
        let position = question
            .get("position")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let mut options = options_by_question.remove(&id).unwrap_or_default();
        options.sort_by_key(|(position, _)| *position);
        let options: Vec<DefinitionOption> =
            options.into_iter().map(|(_, option)| option).collect();

        questions_by_section
            .entry(section_id.to_owned())
            .or_default()
            .push((
                position,
                DefinitionQuestion {
                    id,
                    type_: question
                        .get("type")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_owned(),
                    title: question
                        .get("title")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_owned(),
                    options,
                },
            ));
    }

    // sections sorted by position.
    let mut sections: Vec<(i64, DefinitionSection)> = sections_raw
        .iter()
        .map(|section| {
            let id = section.get("id").and_then(Value::as_str).unwrap_or("");
            let position = section.get("position").and_then(Value::as_i64).unwrap_or(0);
            let mut questions = questions_by_section.remove(id).unwrap_or_default();
            questions.sort_by_key(|(position, _)| *position);
            let questions: Vec<DefinitionQuestion> = questions
                .into_iter()
                .map(|(_, question)| question)
                .collect();
            (position, DefinitionSection { questions })
        })
        .collect();
    sections.sort_by_key(|(position, _)| *position);
    let sections: Vec<DefinitionSection> =
        sections.into_iter().map(|(_, section)| section).collect();

    Ok(Some(FormDefinition { ws_id, sections }))
}

// ---------------------------------------------------------------------------
// PostgREST / RPC helpers.
// ---------------------------------------------------------------------------

/// Calls a `private`-schema PostgREST RPC and returns the JSON array result.
pub(super) async fn call_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    payload: &Value,
) -> Result<Vec<Value>, ()> {
    let Some(rpc_url) = contact_data.rpc_url(function) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let Ok(body) = serde_json::to_string(payload) else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

pub(super) async fn private_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(table, params) else {
        return Err(());
    };
    let response = send_rest_get(contact_data, outbound, &url, None, Some(PRIVATE_SCHEMA)).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

pub(super) async fn send_rest_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: Option<&str>,
    schema: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match access_token {
        Some(token) => format!("Bearer {token}"),
        None => format!("Bearer {service_role_key}"),
    };

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);
    if let Some(schema) = schema {
        request = request.with_header("Accept-Profile", schema);
    }

    outbound.send(request).await.map_err(|_| ())
}
