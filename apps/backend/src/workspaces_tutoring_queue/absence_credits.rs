// Legacy fallback only; original attendance attribution is not persisted.
pub(super) fn unmatched_dates(
    mut absences: Vec<String>,
    mut reservations: Vec<String>,
) -> Vec<String> {
    absences.sort();
    reservations.sort();
    let mut consumed = 0;
    for reservation in reservations {
        if absences
            .get(consumed)
            .is_some_and(|next| next <= &reservation)
        {
            consumed += 1;
        }
    }
    absences.into_iter().skip(consumed).collect()
}
