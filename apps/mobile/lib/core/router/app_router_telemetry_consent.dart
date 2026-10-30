import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:mobile/core/router/routes.dart';

/// Sends a signed-in user with a workspace to the one-time consent prompt, and
/// back to where they were headed once an explicit choice exists.
///
/// Settings is left alone: the user is already at the place to choose.
String? resolveTelemetryConsentRedirect({
  required TelemetryPreference? preference,
  required Uri uri,
  required String matchedLocation,
  required bool hasWorkspace,
}) {
  final pending = preference?.consentPending ?? false;
  if (matchedLocation == Routes.telemetryConsent) {
    return pending ? null : _returnTarget(uri.queryParameters['from']);
  }
  if (!pending || !hasWorkspace) return null;
  if (matchedLocation == Routes.settings ||
      matchedLocation.startsWith('${Routes.settings}/')) {
    return null;
  }
  return Uri(
    path: Routes.telemetryConsent,
    queryParameters: {'from': uri.toString()},
  ).toString();
}

String _returnTarget(String? from) {
  if (from == null ||
      !from.startsWith('/') ||
      from.startsWith('//') ||
      from.startsWith(Routes.telemetryConsent)) {
    return Routes.home;
  }
  return from;
}
