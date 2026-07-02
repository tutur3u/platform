use super::*;

// ---------------------------------------------------------------------------
// JSON normalizers (port of service.ts normalizers)
// ---------------------------------------------------------------------------

pub(super) fn normalize_field_schema(input: &Value) -> Value {
    let Some(array) = input.as_array() else {
        return Value::Array(Vec::new());
    };
    let mut out = Vec::new();
    for field in array {
        let Some(field) = field.as_object() else {
            continue;
        };
        let key = field.get("key").and_then(Value::as_str).unwrap_or("");
        let label = field.get("label").and_then(Value::as_str).unwrap_or("");
        if key.is_empty() || label.is_empty() {
            continue;
        }
        let type_str = field.get("type").and_then(Value::as_str).unwrap_or("");
        let type_value = if ["boolean", "number", "duration", "text", "select"].contains(&type_str)
        {
            type_str
        } else {
            "number"
        };
        let unit = field
            .get("unit")
            .and_then(Value::as_str)
            .map(|value| Value::String(value.to_owned()))
            .unwrap_or(Value::Null);
        let required = field.get("required") == Some(&Value::Bool(true));

        let mut field_json = Map::new();
        field_json.insert("key".to_owned(), Value::String(key.to_owned()));
        field_json.insert("label".to_owned(), Value::String(label.to_owned()));
        field_json.insert("type".to_owned(), Value::String(type_value.to_owned()));
        field_json.insert("unit".to_owned(), unit);
        field_json.insert("required".to_owned(), Value::Bool(required));

        if let Some(options) = field.get("options").and_then(Value::as_array) {
            let normalized: Vec<Value> = options
                .iter()
                .filter_map(|option| option.as_object())
                .filter_map(|option| {
                    let label = option.get("label").and_then(Value::as_str).unwrap_or("");
                    let value = option.get("value").and_then(Value::as_str).unwrap_or("");
                    if label.is_empty() || value.is_empty() {
                        return None;
                    }
                    Some(json!({ "label": label, "value": value }))
                })
                .collect();
            field_json.insert("options".to_owned(), Value::Array(normalized));
        }

        out.push(Value::Object(field_json));
    }
    Value::Array(out)
}

pub(super) fn normalize_quick_add_values(input: &Value) -> Vec<f64> {
    let Some(array) = input.as_array() else {
        return Vec::new();
    };
    array.iter().filter_map(value_to_finite_number).collect()
}

pub(super) fn normalize_composer_config(input: &Value) -> Value {
    let Some(object) = input.as_object() else {
        return Value::Null;
    };

    let mut out = Map::new();
    out.insert(
        "unit".to_owned(),
        object
            .get("unit")
            .and_then(Value::as_str)
            .map(|value| Value::String(value.to_owned()))
            .unwrap_or(Value::Null),
    );

    if let Some(units) = object.get("supported_units").and_then(Value::as_array) {
        let normalized: Vec<Value> = units
            .iter()
            .filter_map(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(|value| Value::String(value.to_owned()))
            .collect();
        out.insert("supported_units".to_owned(), Value::Array(normalized));
    }
    if let Some(increments) = object.get("suggested_increments").and_then(Value::as_array) {
        let normalized: Vec<Value> = increments
            .iter()
            .filter_map(value_to_finite_number)
            .map(json_number)
            .collect();
        out.insert("suggested_increments".to_owned(), Value::Array(normalized));
    }
    if let Some(variant) = object.get("progress_variant").and_then(Value::as_str)
        && ["ring", "bar", "check"].contains(&variant)
    {
        out.insert(
            "progress_variant".to_owned(),
            Value::String(variant.to_owned()),
        );
    }
    if let Some(exercises) = object.get("suggested_exercises").and_then(Value::as_array) {
        let normalized: Vec<Value> = exercises
            .iter()
            .filter_map(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(|value| Value::String(value.to_owned()))
            .collect();
        out.insert("suggested_exercises".to_owned(), Value::Array(normalized));
    }
    out.insert(
        "default_sets".to_owned(),
        finite_number_field(object.get("default_sets")),
    );
    out.insert(
        "default_reps".to_owned(),
        finite_number_field(object.get("default_reps")),
    );
    out.insert(
        "default_weight_unit".to_owned(),
        object
            .get("default_weight_unit")
            .and_then(Value::as_str)
            .map(|value| Value::String(value.to_owned()))
            .unwrap_or(Value::Null),
    );

    Value::Object(out)
}

pub(super) fn finite_number_field(value: Option<&Value>) -> Value {
    match value.and_then(Value::as_f64) {
        Some(number) if number.is_finite() => json_number(number),
        _ => Value::Null,
    }
}

/// Mirrors `normalizeEntryValues`: keep null/bool/number/string scalars, and
/// arrays only if they normalize to >=1 valid exercise block.
pub(super) fn normalize_entry_values(input: &Value) -> Value {
    let Some(object) = input.as_object() else {
        return Value::Object(Map::new());
    };
    let mut out = Map::new();
    for (key, value) in object {
        match value {
            Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {
                out.insert(key.clone(), value.clone());
            }
            Value::Array(_) => {
                let blocks = normalize_exercise_blocks(value);
                if let Value::Array(items) = &blocks
                    && !items.is_empty()
                {
                    out.insert(key.clone(), blocks);
                }
            }
            Value::Object(_) => {}
        }
    }
    Value::Object(out)
}

fn normalize_exercise_blocks(input: &Value) -> Value {
    let Some(array) = input.as_array() else {
        return Value::Array(Vec::new());
    };
    let mut out = Vec::new();
    for block in array {
        let Some(block) = block.as_object() else {
            continue;
        };
        let exercise_name = block
            .get("exercise_name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_owned();
        let sets = block.get("sets").and_then(Value::as_f64).unwrap_or(0.0);
        let reps = block.get("reps").and_then(Value::as_f64).unwrap_or(0.0);
        if exercise_name.is_empty()
            || sets.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater)
            || reps.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater)
        {
            continue;
        }
        let weight = match block.get("weight").and_then(Value::as_f64) {
            Some(weight) if weight.is_finite() => json_number(weight),
            _ => Value::Null,
        };
        let unit = block
            .get("unit")
            .and_then(Value::as_str)
            .map(|value| Value::String(value.to_owned()))
            .unwrap_or(Value::Null);
        let notes = block
            .get("notes")
            .and_then(Value::as_str)
            .map(|value| Value::String(value.to_owned()))
            .unwrap_or(Value::Null);

        out.push(json!({
            "exercise_name": exercise_name,
            "sets": json_number(sets),
            "reps": json_number(reps),
            "weight": weight,
            "unit": unit,
            "notes": notes,
        }));
    }
    Value::Array(out)
}
