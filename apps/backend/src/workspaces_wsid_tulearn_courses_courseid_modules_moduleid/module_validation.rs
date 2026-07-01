use super::*;

// ---------------------------------------------------------------------------
// Module validation: course assignment check + locked/completed state
// ---------------------------------------------------------------------------

pub(super) struct ModuleSummary {
    pub(super) id: String,
    pub(super) name: Option<String>,
    pub(super) sort_key: Option<f64>,
    pub(super) is_published: bool,
    pub(super) completed: bool,
    pub(super) locked: bool,
}

#[derive(Deserialize)]
struct AssignedCourseRow {
    group_id: Option<String>,
}

#[derive(Deserialize)]
struct CourseModuleRow {
    id: Option<String>,
    name: Option<String>,
    sort_key: Option<f64>,
    is_published: Option<bool>,
}

#[derive(Deserialize)]
struct CompletionRow {
    module_id: Option<String>,
}

pub(super) async fn find_module_in_course(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    subject: &TulearnSubject,
    course_id: &str,
    module_id: &str,
) -> Result<Option<ModuleSummary>, ()> {
    // Verify course is assigned to student.
    let select = "group_id,workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(id,ws_id,archived,is_guest,is_course_published)";
    let Some(assign_url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[
            ("select", select.to_owned()),
            (
                "user_id",
                format!("eq.{}", subject.student_workspace_user_id),
            ),
            (
                "workspace_user_groups.ws_id",
                format!("eq.{}", subject.ws_id),
            ),
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
    let assign_resp = service_role_get(contact_data, outbound, &assign_url, None).await?;
    if !(200..300).contains(&assign_resp.status) {
        return Err(());
    }
    let assigned_rows: Vec<AssignedCourseRow> = assign_resp.json().map_err(|_| ())?;
    let course_is_assigned = assigned_rows
        .iter()
        .any(|row| row.group_id.as_deref() == Some(course_id));
    if !course_is_assigned {
        return Ok(None);
    }

    // Fetch published modules for this course, ordered by sort_key.
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
    let module_rows: Vec<CourseModuleRow> = modules_resp.json().map_err(|_| ())?;

    let module_id_list: Vec<String> = module_rows.iter().filter_map(|m| m.id.clone()).collect();

    // Completed module ids for this student.
    let completed_ids = if module_id_list.is_empty() {
        HashSet::new()
    } else {
        fetch_completed_module_ids(
            contact_data,
            outbound,
            &subject.student_platform_user_id,
            &module_id_list,
        )
        .await?
    };

    // Apply locked/completed cascade (same logic as getLearnerCourseDetail).
    let mut prior_incomplete = false;
    for module in module_rows {
        let Some(id) = module.id else { continue };
        let is_published = module.is_published.unwrap_or(false);
        let completed = completed_ids.contains(&id);
        let locked = !is_published || prior_incomplete;
        if !completed && is_published {
            prior_incomplete = true;
        }
        if id == module_id {
            if locked {
                return Ok(None);
            }
            return Ok(Some(ModuleSummary {
                id,
                name: module.name,
                sort_key: module.sort_key,
                is_published,
                completed,
                locked,
            }));
        }
    }

    Ok(None)
}

async fn fetch_completed_module_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    student_platform_user_id: &str,
    module_ids: &[String],
) -> Result<HashSet<String>, ()> {
    let in_filter = in_list(module_ids);
    let Some(url) = contact_data.rest_url(
        "course_module_completion_status",
        &[
            ("select", "module_id".to_owned()),
            ("user_id", format!("eq.{student_platform_user_id}")),
            ("completion_status", "eq.true".to_owned()),
            ("module_id", format!("in.{in_filter}")),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<CompletionRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().filter_map(|r| r.module_id).collect())
}
