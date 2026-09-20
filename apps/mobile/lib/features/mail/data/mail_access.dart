/// Launcher eligibility only; the Mail API remains the access authority.
bool canDiscoverMail(String? email) {
  if (email == null) return false;
  final parts = email.trim().toLowerCase().split('@');
  return parts.length == 2 &&
      parts.first.isNotEmpty &&
      parts.last == 'tuturuuu.com';
}
