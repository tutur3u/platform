import 'package:mobile/data/sources/safe_error_diagnostics.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

String timezoneRateLimitMessage(
  AppLocalizations l10n,
  SafeErrorDiagnostics? diagnostics, {
  bool coolingDown = true,
}) {
  final delay = diagnostics?.retryAfter;
  final hasVercelChallenge =
      diagnostics?.rateLimit?.contains('challenge=vercel') ?? false;
  final details = diagnostics?.rateLimit
      ?.split('; ')
      .where((field) => !field.endsWith('=unknown'))
      .join('; ');
  return [
    if (coolingDown)
      l10n.settingsTimezoneRateLimited
    else
      l10n.settingsTimezoneRetry,
    if (hasVercelChallenge)
      l10n.settingsTimezoneRateLimitedChallenge
    else if (diagnostics?.rateLimit?.startsWith('reason=upstream-or-edge;') ??
        false)
      l10n.settingsTimezoneRateLimitedUpstream,
    if (coolingDown && delay != null && delay > 0)
      l10n.settingsTimezoneRateLimitedRetryAfter(delay),
    if (details != null && details.isNotEmpty)
      l10n.settingsTimezoneRateLimitedDetails(details),
  ].join('\n');
}
