import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

String deviceMfaErrorMessage(Object error, AppLocalizations l10n) {
  if (error is AuthException) {
    if (error.code == 'device_verification_cancelled') {
      return l10n.deviceMfaCancelled;
    }
    if (error.code == 'existing_mfa_required') {
      return l10n.deviceMfaExistingRequired;
    }
  }
  if (error is ApiException) {
    return switch (error.statusCode) {
      401 => l10n.deviceMfaSessionExpired,
      403 => l10n.deviceMfaExistingRequired,
      423 => l10n.deviceMfaLocked,
      429 => l10n.deviceMfaRateLimited,
      >= 500 => l10n.deviceMfaUnavailable,
      0 => l10n.deviceMfaOffline,
      _ => l10n.deviceMfaError,
    };
  }
  return l10n.deviceMfaError;
}
