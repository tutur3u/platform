use super::*;

// ---------------------------------------------------------------------------
// Private-schema data fetchers — paged response rows + matched id set.
// ---------------------------------------------------------------------------

pub(super) async fn fetch_response_metadata_by_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    response_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let mut out = Vec::new();
    for chunk in response_ids.chunks(500) {
        if chunk.is_empty() {
            continue;
        }
        let in_filter = format!("in.({})", chunk.join(","));
        let rows = private_get(
            contact_data,
            outbound,
            "form_responses",
            &[
                (
                    "select",
                    "id, respondent_email, respondent_user_id".to_owned(),
                ),
                ("id", in_filter),
            ],
        )
        .await?;
        out.extend(rows);
    }
    Ok(out)
}

pub(super) async fn fetch_response_answers_by_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    response_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let mut out = Vec::new();
    for chunk in response_ids.chunks(500) {
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
// Private-schema RPCs.
// ---------------------------------------------------------------------------

pub(super) async fn rpc_get_form_response_page(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    form_id: &str,
    query: Option<&str>,
    page_size: f64,
    page: f64,
) -> Result<Vec<Value>, ()> {
    let body = json!({
        "p_form_id": form_id,
        "p_query": query_value(query),
        "p_page_size": number_to_json(page_size),
        "p_page": number_to_json(page),
    });
    private_rpc(contact_data, outbound, "get_form_response_page", &body).await
}

pub(super) async fn rpc_get_form_matched_response_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    form_id: &str,
    query: Option<&str>,
) -> Result<Vec<Value>, ()> {
    let body = json!({
        "p_form_id": form_id,
        "p_query": query_value(query),
    });
    private_rpc(
        contact_data,
        outbound,
        "get_form_matched_response_ids",
        &body,
    )
    .await
}

/// `options.query ?? null` semantics for the RPC arg.
pub(super) fn query_value(query: Option<&str>) -> Value {
    match query {
        Some(value) => Value::String(value.to_owned()),
        None => Value::Null,
    }
}

/// Mirrors JS `Number(...)`: integral values serialize as integers, NaN as null
/// (PostgREST coerces a JSON null integer arg; the legacy code passes the raw
/// `Number(...)` which is NaN -> serialized by supabase-js as null).
pub(super) fn number_to_json(value: f64) -> Value {
    if value.is_nan() {
        return Value::Null;
    }
    if value.fract() == 0.0 && value.is_finite() {
        return json!(value as i64);
    }
    serde_json::Number::from_f64(value)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

pub(super) async fn private_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    body: &Value,
) -> Result<Vec<Value>, ()> {
    let Some(rpc_url) = contact_data.rpc_url(function) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let Ok(body_text) = serde_json::to_string(body) else {
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
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body_text),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // RPC returning SETOF rows yields a JSON array.
    response.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Form definition fetch (private schema). Mirrors fetchFormDefinition, but only
// keeps the fields the /responses payload depends on.
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
            ("select", "*".to_owned()),
            ("id", format!("eq.{form_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await?;
    let Some(form) = form_rows.into_iter().next() else {
        return Ok(None);
    };
    let ws_id = form.get("ws_id").and_then(Value::as_str).map(str::to_owned);

    let sections = private_get(
        contact_data,
        outbound,
        "form_sections",
        &[
            ("select", "*".to_owned()),
            ("form_id", format!("eq.{form_id}")),
        ],
    )
    .await?;
    let questions = private_get(
        contact_data,
        outbound,
        "form_questions",
        &[
            ("select", "*".to_owned()),
            ("form_id", format!("eq.{form_id}")),
        ],
    )
    .await?;

    let question_ids: Vec<String> = questions
        .iter()
        .filter_map(|q| q.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();
    let options = if question_ids.is_empty() {
        Vec::new()
    } else {
        let in_filter = format!("in.({})", question_ids.join(","));
        private_get(
            contact_data,
            outbound,
            "form_question_options",
            &[
                (
                    "select",
                    "id, question_id, label, value, image, position".to_owned(),
                ),
                ("question_id", in_filter),
            ],
        )
        .await?
    };

    let questions_flat = build_questions_flat(&sections, &questions, &options);

    Ok(Some(FormDefinition {
        id: form
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| form_id.to_owned()),
        ws_id,
        questions_flat,
    }))
}

/// Builds the flattened question list in the same order as `buildFormDefinition`:
/// sections sorted by `position`, questions within a section sorted by `position`,
/// options sorted by `position`.
pub(super) fn build_questions_flat(
    sections: &[Value],
    questions: &[Value],
    options: &[Value],
) -> Vec<DefQuestion> {
    let mut sorted_sections: Vec<&Value> = sections.iter().collect();
    sorted_sections.sort_by_key(|s| s.get("position").and_then(Value::as_i64).unwrap_or(0));

    let mut out = Vec::new();
    for section in sorted_sections {
        let section_id = section
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let mut section_questions: Vec<&Value> = questions
            .iter()
            .filter(|q| q.get("section_id").and_then(Value::as_str) == Some(section_id))
            .collect();
        section_questions.sort_by_key(|q| q.get("position").and_then(Value::as_i64).unwrap_or(0));

        for question in section_questions {
            let question_id = question
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let mut question_options: Vec<&Value> = options
                .iter()
                .filter(|o| o.get("question_id").and_then(Value::as_str) == Some(question_id))
                .collect();
            question_options
                .sort_by_key(|o| o.get("position").and_then(Value::as_i64).unwrap_or(0));

            let def_options: Vec<DefOption> = question_options
                .into_iter()
                .map(|o| DefOption {
                    label: o
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_owned(),
                    value: o
                        .get("value")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_owned(),
                })
                .collect();

            out.push(DefQuestion {
                id: question_id.to_owned(),
                title: question
                    .get("title")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                question_type: question
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned(),
                options: def_options,
            });
        }
    }
    out
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
