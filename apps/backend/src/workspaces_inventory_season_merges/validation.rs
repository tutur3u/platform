use crate::BackendRequest;
use serde_json::{Value, json};

pub(super) fn ws(path: &str) -> Option<&str> {
    let rest = path
        .strip_prefix("/api/v1/workspaces/")?
        .strip_suffix("/inventory/sales-periods/merges")?;
    (!rest.is_empty() && !rest.contains('/')).then_some(rest)
}
pub(super) fn uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == b'-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}
pub(super) fn input(request: BackendRequest<'_>) -> Option<Value> {
    let execute = request.method == "POST";
    let data = if execute {
        serde_json::from_str::<Value>(request.body_text?).ok()?
    } else {
        let url = url::Url::parse(request.url?).ok()?;
        Value::Object(
            url.query_pairs()
                .map(|(key, value)| (key.into_owned(), Value::String(value.into_owned())))
                .collect(),
        )
    };
    let source = data.get("sourceId")?.as_str()?;
    let target = data.get("targetId")?.as_str()?;
    if !uuid(source) || !uuid(target) || source.eq_ignore_ascii_case(target) {
        return None;
    }
    let mut args = json!({"p_source_id":source,"p_target_id":target});
    if execute {
        let version = data.get("version")?.as_str()?;
        if !uuid(version) {
            return None;
        }
        args["p_version"] = json!(version);
        for (key, arg, allowed) in [
            (
                "descriptionPolicy",
                "p_description_policy",
                ["source", "target"],
            ),
            ("rulePolicy", "p_rule_policy", ["source", "target"]),
            ("pricePolicy", "p_price_policy", ["block", "target"]),
        ] {
            let value = data.get(key)?.as_str()?;
            if !allowed.contains(&value) {
                return None;
            }
            args[arg] = json!(value);
        }
    } else {
        let version = data.get("version").and_then(Value::as_str);
        if version.is_some_and(|v| !uuid(v)) {
            return None;
        }
        let page = match data.get("page") {
            None => 1,
            Some(Value::String(value))
                if !value.is_empty() && value.bytes().all(|c| c.is_ascii_digit()) =>
            {
                value.parse::<u32>().ok()?
            }
            _ => return None,
        };
        if !(1..=100000).contains(&page) {
            return None;
        }
        args["p_preview_id"] = json!(version);
        args["p_page"] = json!(page);
    }
    Some(args)
}
