import 'package:mobile/features/mastermind/usage/fleet_usage.dart';
import 'package:mobile/l10n/l10n.dart';

/// Why the publisher could not read a machine's quota or accounting.
///
/// Snapshots written before reasons existed carry none and fall back to the
/// generic line, so an older publisher still reads as "not confirmed".
String? usageUnreadReason(AppLocalizations l10n, String? reason) =>
    switch (reason) {
      'not_configured' => l10n.mastermindUsageReaderNotConfigured,
      'reader_missing' => l10n.mastermindUsageReaderMissing,
      'reader_refused' => l10n.mastermindUsageReaderRefused,
      'environment_mismatch' => l10n.mastermindUsageEnvironmentMismatch,
      'config_invalid' => l10n.mastermindUsageConfigInvalid,
      'unreachable' => l10n.mastermindUsageUnreachable,
      'not_reported' => l10n.mastermindUsageQuotaNotReported,
      'read_failed' => l10n.mastermindUsageReadFailed,
      _ => null,
    };

/// Why one provider account is limited or has no current quota reading.
String? usageAccountReason(AppLocalizations l10n, String? reason) =>
    switch (reason) {
      'session' => l10n.mastermindUsageSessionLimited,
      'weekly' => l10n.mastermindUsageWeeklyLimited,
      'monthly' => l10n.mastermindUsageMonthlyLimited,
      'provider' => l10n.mastermindUsageSpendLimited,
      'not_authenticated' => l10n.mastermindUsageSignInRequired,
      'disabled' => l10n.mastermindUsageDisabled,
      'unsupported' => l10n.mastermindUsageUnsupported,
      'not_reported' => l10n.mastermindUsageNotReported,
      'unavailable' => l10n.mastermindUsageProviderUnavailable,
      _ => null,
    };

/// Whether a complete quota reading confirms that no account can run now:
/// every account was checked within [quotaCheckStaleAfter], is limited,
/// signed out or disabled, and reports no window whose reset has passed.
/// Pass every account the machine reports, not a provider-filtered subset.
bool usageNoneAvailable(
  String quotaKind,
  List<UsageAccount> accounts,
  DateTime now,
) =>
    quotaKind == 'complete' &&
    accounts.isNotEmpty &&
    accounts.every((account) {
      final checkedAt = account.checkedAt;
      return checkedAt != null &&
          now.difference(checkedAt) <= quotaCheckStaleAfter &&
          (account.status == 'limited' ||
              (account.status == 'unknown' &&
                  (account.reason == 'not_authenticated' ||
                      account.reason == 'disabled'))) &&
          account.windows.every(
            (window) => window.resetsAt?.isAfter(now) ?? true,
          );
    });
