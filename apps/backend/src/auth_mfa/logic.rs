use super::*;

pub(super) fn authenticator_assurance_level(access_token: &str, user: &Value) -> Result<Value, ()> {
    let payload = jwt_payload(access_token)?;
    let current_level = payload.get("aal").cloned().unwrap_or(Value::Null);
    let next_level = if user_has_verified_factor(user) {
        json!(AAL2)
    } else {
        current_level.clone()
    };
    let current_authentication_methods = payload
        .get("amr")
        .filter(|methods| !methods.is_null())
        .cloned()
        .unwrap_or_else(|| json!([]));

    Ok(json!({
        "currentLevel": current_level,
        "nextLevel": next_level,
        "currentAuthenticationMethods": current_authentication_methods,
    }))
}

pub(super) fn jwt_payload(access_token: &str) -> Result<Value, ()> {
    let mut segments = access_token.split('.');
    let _header = segments.next().ok_or(())?;
    let payload = segments.next().ok_or(())?;
    let _signature = segments.next().ok_or(())?;

    if segments.next().is_some() || payload.trim().is_empty() {
        return Err(());
    }

    let mut padded_payload = payload.to_owned();
    while padded_payload.len() % 4 != 0 {
        padded_payload.push('=');
    }
    let decoded = URL_SAFE.decode(padded_payload.as_bytes()).map_err(|_| ())?;

    serde_json::from_slice::<Value>(&decoded).map_err(|_| ())
}

pub(super) fn user_has_verified_factor(user: &Value) -> bool {
    user.get("factors")
        .and_then(Value::as_array)
        .is_some_and(|factors| {
            factors.iter().any(|factor| {
                factor
                    .get("status")
                    .and_then(Value::as_str)
                    .is_some_and(|status| status == VERIFIED_FACTOR_STATUS)
            })
        })
}

pub(super) fn list_factors_from_user(user: &Value) -> Result<Value, ()> {
    let mut all = Vec::new();
    let mut phone = Vec::new();
    let mut totp = Vec::new();
    let mut webauthn = Vec::new();
    let Some(factors) = user.get("factors") else {
        return Ok(json!({
            "all": all,
            "phone": phone,
            "totp": totp,
            "webauthn": webauthn,
        }));
    };

    if factors.is_null() {
        return Ok(json!({
            "all": all,
            "phone": phone,
            "totp": totp,
            "webauthn": webauthn,
        }));
    }

    let factors = factors.as_array().ok_or(())?;
    for factor in factors {
        all.push(factor.clone());

        if factor
            .get("status")
            .and_then(Value::as_str)
            .is_some_and(|status| status == VERIFIED_FACTOR_STATUS)
        {
            match factor.get("factor_type").and_then(Value::as_str) {
                Some(FACTOR_TYPE_TOTP) => totp.push(factor.clone()),
                Some(FACTOR_TYPE_PHONE) => phone.push(factor.clone()),
                Some(FACTOR_TYPE_WEBAUTHN) => webauthn.push(factor.clone()),
                _ => return Err(()),
            }
        }
    }

    Ok(json!({
        "all": all,
        "phone": phone,
        "totp": totp,
        "webauthn": webauthn,
    }))
}

pub(super) fn totp_enroll_request_body(body_text: Option<&str>) -> Result<String, ()> {
    let body = serde_json::from_str::<Value>(body_text.unwrap_or_default()).map_err(|_| ())?;
    if body.is_null() {
        return Err(());
    }

    let mut enroll_body = Map::new();
    if let Some(friendly_name) = body.get("friendlyName") {
        enroll_body.insert("friendly_name".to_owned(), friendly_name.clone());
    }
    enroll_body.insert("factor_type".to_owned(), json!(FACTOR_TYPE_TOTP));

    Ok(Value::Object(enroll_body).to_string())
}

pub(super) fn normalize_totp_enroll_response(data: &mut Value) {
    if data.get("type").and_then(Value::as_str) != Some(FACTOR_TYPE_TOTP) {
        return;
    }

    let Some(totp) = data.get_mut("totp").and_then(Value::as_object_mut) else {
        return;
    };
    let Some(qr_code) = totp
        .get("qr_code")
        .and_then(Value::as_str)
        .filter(|qr_code| !qr_code.is_empty())
        .map(str::to_owned)
    else {
        return;
    };

    totp.insert(
        "qr_code".to_owned(),
        json!(format!("data:image/svg+xml;utf-8,{qr_code}")),
    );
}
