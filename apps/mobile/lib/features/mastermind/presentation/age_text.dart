import 'package:mobile/l10n/l10n.dart';

/// "just now", "5 min ago", "3 h ago", "2 days ago".
String mastermindAgeText(AppLocalizations l10n, Duration age) {
  final clamped = age.isNegative ? Duration.zero : age;
  if (clamped.inMinutes < 60) {
    return l10n.mastermindAgeMinutes(clamped.inMinutes);
  }
  if (clamped.inHours < 24) return l10n.mastermindAgeHours(clamped.inHours);
  return l10n.mastermindAgeDays(clamped.inDays);
}

/// "5 min", "3 h", "2 d": a span rather than a point in the past, for "for 3 h"
/// and "about 20 min left".
String mastermindDurationText(AppLocalizations l10n, Duration span) {
  final clamped = span.isNegative ? Duration.zero : span;
  if (clamped.inMinutes < 60) {
    return l10n.mastermindDurationMinutes(
      clamped.inMinutes < 1 ? 1 : clamped.inMinutes,
    );
  }
  if (clamped.inHours < 24) {
    return l10n.mastermindDurationHours(clamped.inHours);
  }
  return l10n.mastermindDurationDays(clamped.inDays);
}
