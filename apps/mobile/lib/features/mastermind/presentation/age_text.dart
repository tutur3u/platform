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
