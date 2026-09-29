/// Launcher eligibility only; the Mail API remains the access authority.
bool canDiscoverMail(String? email, {Map<String, dynamic>? appMetadata}) {
  if (email == null) return false;
  final parts = email.trim().toLowerCase().split('@');
  if (parts.length != 2 || parts.first.isEmpty) return false;
  if (parts.last == 'tuturuuu.com') return true;
  final marker = appMetadata?['infrastructure_review_account'];
  return parts.last == 'tutur3u.com' &&
      marker is Map &&
      marker['kind'] == 'review';
}
