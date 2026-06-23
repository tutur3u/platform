//! Stateless field validators for contact / support-inquiry payloads.
//!
//! These are the reusable primitives (`validate_string_length`,
//! `validate_email`, `validate_enum`); the payload-level orchestration that
//! knows the concrete field set stays in `contact.rs`. Each validator pushes
//! human-readable messages onto a shared `errors` accumulator. Extracted
//! verbatim from `contact.rs`.

/// Maximum accepted email length (RFC 5321 address upper bound).
pub(super) const MAX_EMAIL_LENGTH: usize = 320;

/// Pushes an error when `value`'s character count falls outside
/// `[min_length, max_length]`.
pub(super) fn validate_string_length(
    errors: &mut Vec<String>,
    field: &str,
    value: &str,
    min_length: usize,
    max_length: usize,
) {
    let length = value.chars().count();

    if length < min_length {
        errors.push(format!(
            "{field} must contain at least {min_length} characters"
        ));
    }

    if length > max_length {
        errors.push(format!(
            "{field} must contain at most {max_length} characters"
        ));
    }
}

/// Pushes an error when `value` is too long or is not a syntactically valid
/// email address.
pub(super) fn validate_email(errors: &mut Vec<String>, value: &str) {
    if value.chars().count() > MAX_EMAIL_LENGTH {
        errors.push(format!(
            "email must contain at most {MAX_EMAIL_LENGTH} characters"
        ));
        return;
    }

    let Some((local, domain)) = value.split_once('@') else {
        errors.push("email must be a valid email address".to_owned());
        return;
    };

    if local.is_empty()
        || domain.is_empty()
        || !domain.contains('.')
        || value.chars().any(char::is_whitespace)
    {
        errors.push("email must be a valid email address".to_owned());
    }
}

/// Pushes an error when `value` is not one of the `allowed` variants.
pub(super) fn validate_enum(errors: &mut Vec<String>, field: &str, value: &str, allowed: &[&str]) {
    if !allowed.contains(&value) {
        errors.push(format!("{field} is not supported"));
    }
}
