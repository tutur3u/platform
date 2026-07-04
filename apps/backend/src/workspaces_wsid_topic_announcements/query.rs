use super::*;

pub(super) fn parse_list_query(request_url: Option<&str>) -> Result<ListQuery, ()> {
    let mut raw: BTreeMap<String, String> = BTreeMap::new();
    if let Some(url) = request_url.and_then(|value| url::Url::parse(value).ok()) {
        // `Object.fromEntries(searchParams.entries())` keeps the LAST value per key.
        for (key, value) in url.query_pairs() {
            raw.insert(key.into_owned(), value.into_owned());
        }
    }

    let page = match raw.get("page") {
        // `z.coerce.number().int().min(1)` has no upper bound.
        Some(value) => coerce_int(value, 1, None)?,
        None => 1,
    };
    let page_size = match raw.get("pageSize") {
        Some(value) => coerce_int(value, 1, Some(100))?,
        None => 20,
    };

    let q = match raw.get("q") {
        Some(value) => {
            let trimmed = value.trim();
            if trimmed.chars().count() > 200 {
                return Err(());
            }
            trimmed.to_owned()
        }
        None => String::new(),
    };

    let status = match raw.get("status") {
        Some(value) => {
            if !ALLOWED_STATUSES.contains(&value.as_str()) {
                return Err(());
            }
            value.clone()
        }
        None => "active".to_owned(),
    };

    let contact_id = match raw.get("contactId") {
        Some(value) => {
            if !is_uuid_literal(value) {
                return Err(());
            }
            Some(value.clone())
        }
        None => None,
    };

    Ok(ListQuery {
        contact_id,
        page,
        page_size,
        q,
        status,
    })
}

/// Reproduces `z.coerce.number().int().min(min).max(max)` for the common cases.
pub(super) fn coerce_int(value: &str, min: i64, max: Option<i64>) -> Result<i64, ()> {
    let trimmed = value.trim();
    // JS `Number("")` (and whitespace-only) is `0`, not `NaN`.
    let number: f64 = if trimmed.is_empty() {
        0.0
    } else {
        trimmed.parse::<f64>().map_err(|_| ())?
    };

    if !number.is_finite() || number.fract() != 0.0 {
        return Err(());
    }
    let number = number as i64;
    if number < min {
        return Err(());
    }
    if let Some(max) = max
        && number > max
    {
        return Err(());
    }

    Ok(number)
}

/// Mirrors the legacy `status` filter branch on the announcements query.
pub(super) fn status_filter(status: &str) -> Option<(&'static str, String)> {
    match status {
        "active" => Some(("status", "neq.cancelled".to_owned())),
        "all" => None,
        other => Some(("status", format!("eq.{other}"))),
    }
}
