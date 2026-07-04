use super::*;

// ─── Learner types ────────────────────────────────────────────────────────────

pub(super) struct LearnerModuleSummary {
    pub(super) id: String,
    pub(super) completed: bool,
    pub(super) locked: bool,
    pub(super) counts_flashcards: u64,
    pub(super) counts_quizzes: u64,
    pub(super) counts_quiz_sets: u64,
}

pub(super) struct LearnerCourseDetail {
    pub(super) modules: Vec<LearnerModuleSummary>,
}

#[derive(Deserialize)]
pub(super) struct CourseGroupSummaryRow {
    id: Option<String>,
    name: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct ModuleGroupRow {
    id: Option<String>,
    group_id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct DetailModuleRow {
    id: Option<String>,
    is_published: Option<bool>,
}

#[derive(Deserialize)]
pub(super) struct ModuleIdRow {
    module_id: Option<String>,
}

pub(super) struct CourseGroup {
    pub(super) ws_id: String,
    pub(super) name: Value,
    pub(super) description: Value,
}

// ─── Learner course summaries (port of getLearnerCourseSummaries) ────────────

pub(super) async fn get_learner_course_summaries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_platform_user_id: &str,
    student_workspace_user_id: &str,
) -> Result<Vec<Value>, ()> {
    let course_ids =
        get_assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    if course_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_filter = format!("in.({})", course_ids.join(","));

    // courses (id, name, description) ordered by name asc, filtered by ws_id + in(ids)
    let courses = {
        let url = contact_data
            .rest_url(
                "workspace_user_groups",
                &[
                    ("select", "id,name,description".to_owned()),
                    ("ws_id", format!("eq.{ws_id}")),
                    ("id", in_filter.clone()),
                    ("order", "name.asc".to_owned()),
                ],
            )
            .ok_or(())?;
        let response = send_service_role_request(contact_data, outbound, &url).await?;
        if !(200..300).contains(&response.status) {
            return Err(());
        }
        response
            .json::<Vec<CourseGroupSummaryRow>>()
            .map_err(|_| ())?
    };

    // published modules (id, group_id) for these courses
    let modules = {
        let url = contact_data
            .rest_url(
                "workspace_course_modules",
                &[
                    ("select", "id,group_id".to_owned()),
                    ("group_id", in_filter.clone()),
                    ("is_published", "eq.true".to_owned()),
                ],
            )
            .ok_or(())?;
        let response = send_service_role_request(contact_data, outbound, &url).await?;
        if !(200..300).contains(&response.status) {
            return Err(());
        }
        response.json::<Vec<ModuleGroupRow>>().map_err(|_| ())?
    };

    // completed module ids for this learner
    let completed =
        fetch_completed_module_ids(contact_data, outbound, student_platform_user_id, None).await?;

    let mut modules_by_course: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for module in modules {
        let (Some(id), Some(group_id)) = (module.id, module.group_id) else {
            continue;
        };
        modules_by_course.entry(group_id).or_default().push(id);
    }

    let summaries = courses
        .into_iter()
        .map(|course| {
            let id = course.id.unwrap_or_default();
            let module_ids = modules_by_course.get(&id).cloned().unwrap_or_default();
            let total = module_ids.len();
            let completed_count = module_ids
                .iter()
                .filter(|module_id| completed.contains(*module_id))
                .count();
            let progress = if total > 0 {
                round_percent(completed_count, total)
            } else {
                0
            };
            json!({
                "id": id,
                "name": course.name,
                "description": course.description,
                "completedModules": completed_count,
                "totalModules": total,
                "progress": progress,
            })
        })
        .collect();

    Ok(summaries)
}

// ─── Learner course detail (port of getLearnerCourseDetail) ──────────────────

pub(super) async fn get_learner_course_detail(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
    ws_id: &str,
    student_platform_user_id: &str,
    student_workspace_user_id: &str,
) -> Result<Option<LearnerCourseDetail>, ()> {
    let course_ids =
        get_assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    if !course_ids.iter().any(|id| id == course_id) {
        return Ok(None);
    }

    // course existence check (maybeSingle).
    {
        let url = contact_data
            .rest_url(
                "workspace_user_groups",
                &[
                    ("select", "id,name,description".to_owned()),
                    ("ws_id", format!("eq.{ws_id}")),
                    ("id", format!("eq.{course_id}")),
                    ("limit", "1".to_owned()),
                ],
            )
            .ok_or(())?;
        let response = send_service_role_request(contact_data, outbound, &url).await?;
        if !(200..300).contains(&response.status) {
            return Err(());
        }
        let exists = response
            .json::<Vec<CourseGroupSummaryRow>>()
            .map_err(|_| ())?
            .into_iter()
            .next()
            .is_some();
        if !exists {
            return Ok(None);
        }
    }

    // published modules (id, is_published) ordered by sort_key asc.
    let module_rows = {
        let url = contact_data
            .rest_url(
                "workspace_course_modules",
                &[
                    ("select", "id,name,sort_key,is_published".to_owned()),
                    ("group_id", format!("eq.{course_id}")),
                    ("is_published", "eq.true".to_owned()),
                    ("order", "sort_key.asc".to_owned()),
                ],
            )
            .ok_or(())?;
        let response = send_service_role_request(contact_data, outbound, &url).await?;
        if !(200..300).contains(&response.status) {
            return Err(());
        }
        response.json::<Vec<DetailModuleRow>>().map_err(|_| ())?
    };

    let module_id_list: Vec<String> = module_rows.iter().filter_map(|m| m.id.clone()).collect();

    let (completed, flashcards, quizzes, quiz_sets) = if module_id_list.is_empty() {
        (
            std::collections::HashSet::new(),
            std::collections::HashMap::new(),
            std::collections::HashMap::new(),
            std::collections::HashMap::new(),
        )
    } else {
        let completed = fetch_completed_module_ids(
            contact_data,
            outbound,
            student_platform_user_id,
            Some(&module_id_list),
        )
        .await?;
        let flashcards = fetch_module_counts(
            contact_data,
            outbound,
            "course_module_flashcards",
            &module_id_list,
        )
        .await?;
        let quizzes = fetch_module_counts(
            contact_data,
            outbound,
            "course_module_quizzes",
            &module_id_list,
        )
        .await?;
        let quiz_sets = fetch_module_counts(
            contact_data,
            outbound,
            "course_module_quiz_sets",
            &module_id_list,
        )
        .await?;
        (completed, flashcards, quizzes, quiz_sets)
    };

    let module_id_set: std::collections::HashSet<&String> = module_id_list.iter().collect();

    let mut prior_incomplete = false;
    let modules = module_rows
        .into_iter()
        .filter_map(|module| {
            let id = module.id?;
            let is_published = module.is_published.unwrap_or(false);
            let completed_flag = completed.contains(&id);
            let locked = !is_published || prior_incomplete;
            if !completed_flag && is_published {
                prior_incomplete = true;
            }
            // counts only counted for module ids present in the set (mirrors
            // countByModule which checks moduleIds.has(row.module_id)). All ids
            // here are in the set by construction.
            let _ = &module_id_set;
            Some(LearnerModuleSummary {
                counts_flashcards: flashcards.get(&id).copied().unwrap_or(0),
                counts_quizzes: quizzes.get(&id).copied().unwrap_or(0),
                counts_quiz_sets: quiz_sets.get(&id).copied().unwrap_or(0),
                id,
                completed: completed_flag,
                locked,
            })
        })
        .collect();

    Ok(Some(LearnerCourseDetail { modules }))
}

// ─── Assigned course ids (port of getAssignedCourseIds) ──────────────────────

pub(super) async fn get_assigned_course_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_workspace_user_id: &str,
) -> Result<Vec<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_user_groups_users",
            &[
                (
                    "select",
                    "group_id,workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(id,ws_id,archived,is_guest,is_course_published)"
                        .to_owned(),
                ),
                ("user_id", format!("eq.{student_workspace_user_id}")),
                ("workspace_user_groups.ws_id", format!("eq.{ws_id}")),
                ("workspace_user_groups.archived", "eq.false".to_owned()),
                ("workspace_user_groups.is_guest", "eq.false".to_owned()),
                (
                    "workspace_user_groups.is_course_published",
                    "eq.true".to_owned(),
                ),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    #[derive(Deserialize)]
    struct GroupIdRow {
        group_id: Option<String>,
    }

    Ok(response
        .json::<Vec<GroupIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.group_id)
        .collect())
}

// ─── Shared service-role REST reads ──────────────────────────────────────────

/// Returns set of completed module ids for the learner. When `module_ids` is
/// provided, restricts the lookup with `in.(...)`.
pub(super) async fn fetch_completed_module_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    student_platform_user_id: &str,
    module_ids: Option<&[String]>,
) -> Result<std::collections::HashSet<String>, ()> {
    let mut params = vec![
        ("select", "module_id".to_owned()),
        ("user_id", format!("eq.{student_platform_user_id}")),
        ("completion_status", "eq.true".to_owned()),
    ];
    if let Some(module_ids) = module_ids {
        params.push(("module_id", format!("in.({})", module_ids.join(","))));
    }

    let url = contact_data
        .rest_url("course_module_completion_status", &params)
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<ModuleIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.module_id)
        .collect())
}

/// Counts rows per module id for a `course_module_*` join table restricted to
/// the given module ids. Mirrors the `.in('module_id', moduleIds)` + map count.
pub(super) async fn fetch_module_counts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    module_ids: &[String],
) -> Result<std::collections::HashMap<String, u64>, ()> {
    if module_ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let url = contact_data
        .rest_url(
            table,
            &[
                ("select", "module_id".to_owned()),
                ("module_id", format!("in.({})", module_ids.join(","))),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let id_set: std::collections::HashSet<&String> = module_ids.iter().collect();
    let mut counts: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
    for row in response.json::<Vec<ModuleIdRow>>().map_err(|_| ())? {
        if let Some(module_id) = row.module_id
            && id_set.contains(&module_id)
        {
            *counts.entry(module_id).or_insert(0) += 1;
        }
    }
    Ok(counts)
}

pub(super) async fn fetch_course_group(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
) -> Result<Option<CourseGroup>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_user_groups",
            &[
                ("select", "id,ws_id,name,description".to_owned()),
                ("id", format!("eq.{group_id}")),
                ("is_course_published", "eq.true".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let Some(row) = response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
    else {
        return Ok(None);
    };

    let ws_id = row
        .get("ws_id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or(())?;

    Ok(Some(CourseGroup {
        ws_id,
        name: row.get("name").cloned().unwrap_or(Value::Null),
        description: row.get("description").cloned().unwrap_or(Value::Null),
    }))
}

pub(super) async fn fetch_published_modules(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_course_modules",
            &[
                (
                    "select",
                    "id,name,content,extra_content,youtube_links,group_id,module_group_id,created_at,is_public,is_published,sort_key"
                        .to_owned(),
                ),
                ("group_id", format!("eq.{group_id}")),
                ("is_published", "eq.true".to_owned()),
                // Match legacy ordering: sort_key asc nullsLast, then created_at asc.
                ("order", "sort_key.asc.nullslast".to_owned()),
                ("order", "created_at.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

// ─── REST request helpers ────────────────────────────────────────────────────

pub(super) async fn send_service_role_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

pub(super) async fn send_caller_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}
