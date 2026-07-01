use super::*;

// ---------------------------------------------------------------------------
// Query parsing (zod listQuerySchema). On any validation failure return Err(())
// so the caller emits the single createErrorResponse(... INVALID_QUERY_PARAMS).
// ---------------------------------------------------------------------------

pub(super) fn parse_list_query(request_url: Option<&str>) -> Result<ListQuery, ()> {
    let mut path: Option<String> = None;
    let mut search: Option<String> = None;
    let mut limit: Option<String> = None;
    let mut offset: Option<String> = None;
    let mut sort_by: Option<String> = None;
    let mut sort_order: Option<String> = None;

    if let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "path" => path = Some(value.into_owned()),
                "search" => search = Some(value.into_owned()),
                "limit" => limit = Some(value.into_owned()),
                "offset" => offset = Some(value.into_owned()),
                "sortBy" => sort_by = Some(value.into_owned()),
                "sortOrder" => sort_order = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    // path: string().max(MAX_MEDIUM_TEXT_LENGTH).optional().default('')
    let path_value = path.unwrap_or_default();
    if path_value.chars().count() > MAX_MEDIUM_TEXT_LENGTH {
        return Err(());
    }

    // search: string().max(MAX_SEARCH_LENGTH).optional()
    if let Some(ref search_value) = search
        && search_value.chars().count() > MAX_SEARCH_LENGTH
    {
        return Err(());
    }

    // limit: coerce.number().int().min(1).max(MAX_SHORT_TEXT_LENGTH).default(50)
    let limit_value = match limit {
        Some(raw) => coerce_int(&raw).ok_or(())?,
        None => DEFAULT_LIMIT,
    };
    if !(1..=MAX_SHORT_TEXT_LENGTH).contains(&limit_value) {
        return Err(());
    }

    // offset: coerce.number().int().min(0).default(0)
    let offset_value = match offset {
        Some(raw) => coerce_int(&raw).ok_or(())?,
        None => DEFAULT_OFFSET,
    };
    if offset_value < 0 {
        return Err(());
    }

    // sortBy: enum(['name','created_at','updated_at','size']).default('name')
    let sort_by_value = sort_by.unwrap_or_else(|| "name".to_owned());
    if !matches!(
        sort_by_value.as_str(),
        "name" | "created_at" | "updated_at" | "size"
    ) {
        return Err(());
    }

    // sortOrder: enum(['asc','desc']).default('asc')
    let sort_order_value = sort_order.unwrap_or_else(|| "asc".to_owned());
    if !matches!(sort_order_value.as_str(), "asc" | "desc") {
        return Err(());
    }

    Ok(ListQuery {
        path: path_value,
        search,
        limit: limit_value,
        offset: offset_value,
        sort_by: sort_by_value,
        sort_order: sort_order_value,
    })
}

/// Mirror of zod's `z.coerce.number().int()`: coerce the string to a number,
/// then require it to be a non-fractional finite integer.
fn coerce_int(raw: &str) -> Option<i64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        // z.coerce.number()('') === Number('') === 0
        return Some(0);
    }
    let parsed = trimmed.parse::<f64>().ok()?;
    if !parsed.is_finite() || parsed.fract() != 0.0 {
        return None;
    }
    Some(parsed as i64)
}
