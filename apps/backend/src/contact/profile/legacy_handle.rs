use super::username_policy::is_reserved_username;
pub(super) fn valid_new_handle(value: &str) -> bool {
    (5..=32).contains(&value.len())
        && !is_reserved_username(value)
        && value
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
        && value
            .bytes()
            .next()
            .is_some_and(|c| c.is_ascii_alphanumeric())
}
pub(super) fn resolve_handle_update(original: &str, current: Option<&str>) -> Option<String> {
    if current == Some(original) {
        return Some(original.to_owned());
    }
    let normalized = original.trim().to_lowercase();
    valid_new_handle(&normalized).then_some(normalized)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_exact_legacy_values_only_for_their_current_owner() {
        for value in ["old", "google", "Legacy_Name"] {
            assert_eq!(
                resolve_handle_update(value, Some(value)),
                Some(value.to_owned())
            );
        }
        for value in ["old", "google", "_invalid"] {
            assert_eq!(resolve_handle_update(value, Some("other_creator")), None);
            assert_eq!(resolve_handle_update(value, None), None);
        }
        assert_eq!(
            resolve_handle_update(" New_Creator ", None),
            Some("new_creator".to_owned())
        );
    }
}
