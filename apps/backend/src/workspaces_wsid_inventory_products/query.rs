use super::*;

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

pub(super) fn parse_products_query(request_url: Option<&str>) -> Result<ProductsQuery, ()> {
    let mut q_raw: Option<String> = None;
    let mut page_raw: Option<String> = None;
    let mut page_size_raw: Option<String> = None;
    let mut category_id_raw: Option<String> = None;
    let mut manufacturer_id_raw: Option<String> = None;
    let mut sort_by_raw: Option<String> = None;
    let mut sort_order_raw: Option<String> = None;
    let mut status_raw: Option<String> = None;

    if let Some(url) = request_url.and_then(|u| url::Url::parse(u).ok()) {
        for (key, value) in url.query_pairs() {
            let value = value.into_owned();
            match key.as_ref() {
                "q" => q_raw = Some(value),
                "page" => page_raw = Some(value),
                "pageSize" => page_size_raw = Some(value),
                "categoryId" => category_id_raw = Some(value),
                "manufacturerId" => manufacturer_id_raw = Some(value),
                "sortBy" => sort_by_raw = Some(value),
                "sortOrder" => sort_order_raw = Some(value),
                "status" => status_raw = Some(value),
                _ => {}
            }
        }
    }

    // `q`: string, max 500, default ''.
    let q = match q_raw {
        None => String::new(),
        Some(v) => {
            if v.chars().count() > MAX_SEARCH_LENGTH {
                return Err(());
            }
            v
        }
    };

    // `page` / `pageSize`: coerce number, int, min 1.
    let page = coerce_int_param(page_raw.as_deref(), 1, i64::MAX, DEFAULT_PAGE)?;
    let page_size = coerce_int_param(
        page_size_raw.as_deref(),
        1,
        MAX_PAGE_SIZE,
        DEFAULT_PAGE_SIZE,
    )?;

    // `categoryId` / `manufacturerId`: z.guid().optional().
    // Non-UUID values are stored so the RPC guard can detect them (empty
    // response, not 400).
    let category_id = category_id_raw.filter(|v| !v.is_empty());
    let manufacturer_id = manufacturer_id_raw.filter(|v| !v.is_empty());

    // `sortBy`: optional enum.
    const VALID_SORT_BY: [&str; 7] = [
        "id",
        "name",
        "manufacturer",
        "description",
        "usage",
        "category_id",
        "created_at",
    ];
    let sort_by = match sort_by_raw.as_deref() {
        None | Some("") => DEFAULT_SORT_BY.to_owned(),
        Some(v) if VALID_SORT_BY.contains(&v) => v.to_owned(),
        Some(_) => return Err(()),
    };

    // `sortOrder`: optional enum.
    let sort_order = match sort_order_raw.as_deref() {
        None | Some("") => DEFAULT_SORT_ORDER.to_owned(),
        Some("asc") => "asc".to_owned(),
        Some("desc") => "desc".to_owned(),
        Some(_) => return Err(()),
    };

    // `status`: enum, default 'active'.
    let status = match status_raw.as_deref() {
        None | Some("") | Some("active") => DEFAULT_STATUS.to_owned(),
        Some("archived") => "archived".to_owned(),
        Some("all") => "all".to_owned(),
        Some(_) => return Err(()),
    };

    Ok(ProductsQuery {
        q,
        page,
        page_size,
        category_id,
        manufacturer_id,
        sort_by,
        sort_order,
        status,
    })
}

/// Mirrors `z.coerce.number().int().min(min).max(max).default(default)`.
pub(super) fn coerce_int_param(
    raw: Option<&str>,
    min: i64,
    max: i64,
    default: i64,
) -> Result<i64, ()> {
    let Some(raw) = raw else {
        return Ok(default);
    };

    let trimmed = raw.trim();
    let number: f64 = if trimmed.is_empty() {
        return Err(());
    } else {
        trimmed.parse::<f64>().map_err(|_| ())?
    };

    if !number.is_finite() || number.fract() != 0.0 {
        return Err(());
    }

    let value = number as i64;
    if value < min || value > max {
        return Err(());
    }

    Ok(value)
}
