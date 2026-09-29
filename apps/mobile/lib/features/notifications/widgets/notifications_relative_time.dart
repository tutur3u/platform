part of 'notifications_sheet.dart';

String _formatRelativeTime(BuildContext context, DateTime timestamp) {
  final difference = DateTime.now().difference(timestamp);
  if (difference.inSeconds < 45) {
    return context.l10n.notificationsJustNow;
  }
  if (difference.inMinutes < 60) {
    return context.l10n.notificationsMinutesAgo(difference.inMinutes);
  }
  if (difference.inHours < 24) {
    return context.l10n.notificationsHoursAgo(difference.inHours);
  }
  if (difference.inDays < 7) {
    return context.l10n.notificationsDaysAgo(difference.inDays);
  }
  return DateFormat.MMMd(
    Localizations.localeOf(context).toLanguageTag(),
  ).format(timestamp);
}
