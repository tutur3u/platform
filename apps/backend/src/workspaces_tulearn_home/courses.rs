use super::*;

// ---------------------------------------------------------------------------
// Assigned course ids (port of courses.ts::getAssignedCourseIds).
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct AssignedCourseRow {
    group_id: Option<String>,
}

pub(super) async fn get_assigned_course_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_workspace_user_id: &str,
) -> Result<Vec<String>, ()> {
    let select = "group_id,workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(id,ws_id,archived,is_guest,is_course_published)";
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[
            ("select", select.to_owned()),
            ("user_id", format!("eq.{student_workspace_user_id}")),
            ("workspace_user_groups.ws_id", format!("eq.{ws_id}")),
            ("workspace_user_groups.archived", "eq.false".to_owned()),
            ("workspace_user_groups.is_guest", "eq.false".to_owned()),
            (
                "workspace_user_groups.is_course_published",
                "eq.true".to_owned(),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<AssignedCourseRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().filter_map(|row| row.group_id).collect())
}

// ---------------------------------------------------------------------------
// Course summaries (port of courses.ts::getLearnerCourseSummaries).
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct CourseSummary {
    id: String,
    name: Option<String>,
    description: Option<String>,
    completed_modules: usize,
    total_modules: usize,
    progress: i64,
}

fn course_summary_json(course: &CourseSummary) -> Value {
    json!({
        "id": course.id,
        "name": course.name,
        "description": course.description,
        "completedModules": course.completed_modules,
        "totalModules": course.total_modules,
        "progress": course.progress,
    })
}

#[derive(Deserialize)]
struct CourseRow {
    id: Option<String>,
    name: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize)]
struct ModuleGroupRow {
    id: Option<String>,
    group_id: Option<String>,
}

#[derive(Deserialize)]
struct ModuleIdRow {
    module_id: Option<String>,
}

async fn fetch_course_summaries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_platform_user_id: &str,
    course_ids: &[String],
) -> Result<Vec<CourseSummary>, ()> {
    if course_ids.is_empty() {
        return Ok(Vec::new());
    }
    let in_filter = in_list(course_ids);

    // Courses.
    let Some(courses_url) = contact_data.rest_url(
        "workspace_user_groups",
        &[
            ("select", "id,name,description".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("in.{in_filter}")),
            ("order", "name.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let courses_resp = service_role_get(contact_data, outbound, &courses_url, None).await?;
    if !(200..300).contains(&courses_resp.status) {
        return Err(());
    }
    let courses: Vec<CourseRow> = courses_resp.json().map_err(|_| ())?;

    // Published modules per course.
    let Some(modules_url) = contact_data.rest_url(
        "workspace_course_modules",
        &[
            ("select", "id,group_id".to_owned()),
            ("group_id", format!("in.{in_filter}")),
            ("is_published", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let modules_resp = service_role_get(contact_data, outbound, &modules_url, None).await?;
    if !(200..300).contains(&modules_resp.status) {
        return Err(());
    }
    let modules: Vec<ModuleGroupRow> = modules_resp.json().map_err(|_| ())?;

    // Completed module ids for this student (platform user id).
    let completed_module_ids =
        fetch_completed_module_ids(contact_data, outbound, student_platform_user_id, None).await?;

    // Index modules by course.
    let mut modules_by_course: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for module in modules {
        if let (Some(id), Some(group_id)) = (module.id, module.group_id) {
            modules_by_course.entry(group_id).or_default().push(id);
        }
    }

    let mut summaries = Vec::with_capacity(courses.len());
    for course in courses {
        let Some(course_id) = course.id else { continue };
        let module_ids = modules_by_course
            .get(&course_id)
            .cloned()
            .unwrap_or_default();
        let completed = module_ids
            .iter()
            .filter(|id| completed_module_ids.contains(*id))
            .count();
        let total = module_ids.len();
        let progress = if total > 0 {
            ((completed as f64 / total as f64) * 100.0).round() as i64
        } else {
            0
        };
        summaries.push(CourseSummary {
            id: course_id,
            name: course.name,
            description: course.description,
            completed_modules: completed,
            total_modules: total,
            progress,
        });
    }

    Ok(summaries)
}

pub(super) async fn get_learner_course_summaries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_platform_user_id: &str,
    student_workspace_user_id: &str,
) -> Result<Value, ()> {
    let course_ids =
        get_assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    let summaries = fetch_course_summaries(
        contact_data,
        outbound,
        ws_id,
        student_platform_user_id,
        &course_ids,
    )
    .await?;
    Ok(Value::Array(
        summaries.iter().map(course_summary_json).collect(),
    ))
}

/// `course_module_completion_status` filtered on the student's platform user id
/// and `completion_status = true`. When `module_ids` is provided, also filters
/// by `module_id in (...)`.
async fn fetch_completed_module_ids(
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
        if module_ids.is_empty() {
            return Ok(std::collections::HashSet::new());
        }
        params.push(("module_id", format!("in.{}", in_list(module_ids))));
    }
    let Some(url) = contact_data.rest_url("course_module_completion_status", &params) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<ModuleIdRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().filter_map(|row| row.module_id).collect())
}

// ---------------------------------------------------------------------------
// Course detail (port of courses.ts::getLearnerCourseDetail) — only the parts
// needed by getRecommendedPracticeItem (module list with completed/locked).
// ---------------------------------------------------------------------------

struct CourseDetailModule {
    id: String,
    completed: bool,
    locked: bool,
}

struct CourseDetail {
    id: String,
    name: Option<String>,
    description: Option<String>,
    modules: Vec<CourseDetailModule>,
}

#[derive(Deserialize)]
struct DetailCourseRow {
    id: Option<String>,
    name: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize)]
struct DetailModuleRow {
    id: Option<String>,
    is_published: Option<bool>,
}

async fn get_learner_course_detail(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_platform_user_id: &str,
    student_workspace_user_id: &str,
    course_id: &str,
) -> Result<Option<CourseDetail>, ()> {
    let course_ids =
        get_assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    if !course_ids.iter().any(|id| id == course_id) {
        return Ok(None);
    }

    // Course row.
    let Some(course_url) = contact_data.rest_url(
        "workspace_user_groups",
        &[
            ("select", "id,name,description".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("eq.{course_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let course_resp = service_role_get(contact_data, outbound, &course_url, None).await?;
    if !(200..300).contains(&course_resp.status) {
        return Err(());
    }
    let course_rows: Vec<DetailCourseRow> = course_resp.json().map_err(|_| ())?;
    let Some(course) = course_rows.into_iter().next() else {
        return Ok(None);
    };
    let Some(course_id_value) = course.id else {
        return Ok(None);
    };

    // Published modules, ordered by sort_key asc.
    let Some(modules_url) = contact_data.rest_url(
        "workspace_course_modules",
        &[
            ("select", "id,name,sort_key,is_published".to_owned()),
            ("group_id", format!("eq.{course_id}")),
            ("is_published", "eq.true".to_owned()),
            ("order", "sort_key.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let modules_resp = service_role_get(contact_data, outbound, &modules_url, None).await?;
    if !(200..300).contains(&modules_resp.status) {
        return Err(());
    }
    let module_rows: Vec<DetailModuleRow> = modules_resp.json().map_err(|_| ())?;

    let module_id_list: Vec<String> = module_rows.iter().filter_map(|m| m.id.clone()).collect();

    let completed_module_ids = fetch_completed_module_ids(
        contact_data,
        outbound,
        student_platform_user_id,
        Some(&module_id_list),
    )
    .await?;

    // Mirror the locked/completed cascade from the legacy code.
    let mut prior_incomplete = false;
    let mut modules = Vec::with_capacity(module_rows.len());
    for module in module_rows {
        let Some(id) = module.id else { continue };
        let is_published = module.is_published.unwrap_or(false);
        let completed = completed_module_ids.contains(&id);
        let locked = !is_published || prior_incomplete;
        if !completed && is_published {
            prior_incomplete = true;
        }
        modules.push(CourseDetailModule {
            id,
            completed,
            locked,
        });
    }

    Ok(Some(CourseDetail {
        id: course_id_value,
        name: course.name,
        description: course.description,
        modules,
    }))
}

// ---------------------------------------------------------------------------
// Recommended practice (port of courses.ts::getRecommendedPracticeItem).
// Note: the legacy code re-derives module `name` from the same query; we fetch
// the module name lazily once a candidate module is chosen.
// ---------------------------------------------------------------------------

pub(super) async fn get_recommended_practice_item(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_platform_user_id: &str,
    student_workspace_user_id: &str,
) -> Result<Value, ()> {
    let course_ids =
        get_assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    let courses = fetch_course_summaries(
        contact_data,
        outbound,
        ws_id,
        student_platform_user_id,
        &course_ids,
    )
    .await?;

    for course in &courses {
        let Some(detail) = get_learner_course_detail(
            contact_data,
            outbound,
            ws_id,
            student_platform_user_id,
            student_workspace_user_id,
            &course.id,
        )
        .await?
        else {
            continue;
        };

        // First unlocked + incomplete module, else first unlocked module.
        let chosen = detail
            .modules
            .iter()
            .find(|candidate| !candidate.completed && !candidate.locked)
            .or_else(|| detail.modules.iter().find(|candidate| !candidate.locked));

        if let Some(module) = chosen {
            let module_name =
                fetch_module_name(contact_data, outbound, &detail.id, &module.id).await?;
            return Ok(json!({
                "type": "module",
                "id": module.id,
                "title": module_name,
                "courseId": detail.id,
                "courseName": detail.name,
                "prompt": detail.description,
            }));
        }
    }

    Ok(Value::Null)
}

async fn fetch_module_name(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
    module_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_course_modules",
        &[
            ("select", "name".to_owned()),
            ("id", format!("eq.{module_id}")),
            ("group_id", format!("eq.{course_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    #[derive(Deserialize)]
    struct NameRow {
        name: Option<String>,
    }
    let rows: Vec<NameRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().next().and_then(|row| row.name))
}
