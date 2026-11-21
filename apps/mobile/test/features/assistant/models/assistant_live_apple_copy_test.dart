import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/core/platform/apple_store_policy.dart';
import 'package:mobile/features/assistant/models/assistant_live_eligibility.dart';
import 'package:mobile/features/assistant/models/assistant_live_failure.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';

// Words that steer toward buying or managing a plan outside the store.
final _steering = RegExp(
  r'upgrade|top.?up|subscri|purchase|\bbuy\b|billing|pricing|checkout|'
  r'paid plan|tuturuuu\.com|on the web|nâng cấp|nạp thêm|trả phí|thanh toán|'
  'đăng ký gói|mua |trên web',
  caseSensitive: false,
);

const List<TargetPlatform> _apple = [TargetPlatform.iOS, TargetPlatform.macOS];

AssistantLiveEligibility _blocked(AssistantLiveBlockReason reason) =>
    AssistantLiveEligibility(
      eligible: false,
      reason: reason,
      balance: 120,
      minimumCredits: 500,
      resetAt: DateTime(2026, 11, 20, 17, 30),
    );

void main() {
  setUpAll(initializeDateFormatting);

  test('only iOS and macOS count as Apple store platforms', () {
    expect(isAppleStorePlatform(TargetPlatform.iOS), isTrue);
    expect(isAppleStorePlatform(TargetPlatform.macOS), isTrue);
    expect(isAppleStorePlatform(TargetPlatform.android), isFalse);
    expect(isAppleStorePlatform(TargetPlatform.windows), isFalse);
    expect(isAppleStorePlatform(TargetPlatform.linux), isFalse);
  });

  for (final l10n in <AppLocalizations>[
    AppLocalizationsEn(),
    AppLocalizationsVi(),
  ]) {
    for (final platform in _apple) {
      test(
        '${l10n.localeName} ${platform.name}: Live refusals never steer',
        () {
          for (final reason in AssistantLiveBlockReason.values) {
            final e = _blocked(reason);
            final copy = [
              e.shortReason(l10n, platform: platform),
              e.title(l10n, platform: platform),
              e.body(l10n, now: DateTime(2026, 11, 20, 9), platform: platform),
            ];
            for (final line in copy) {
              expect(
                _steering.hasMatch(line),
                isFalse,
                reason: '${reason.code} on ${platform.name}: "$line"',
              );
            }
          }
        },
      );

      test(
        '${l10n.localeName} ${platform.name}: credit failure has no top-up',
        () {
          final line = assistantLiveErrorLabel(
            l10n,
            AssistantLiveFailure.credits,
            platform: platform,
          );
          expect(_steering.hasMatch(line), isFalse, reason: line);
        },
      );
    }
  }

  test('Android keeps its billing copy', () {
    final l10n = AppLocalizationsEn();
    final plan = _blocked(AssistantLiveBlockReason.planRequired);
    expect(
      plan.title(l10n, platform: TargetPlatform.android),
      l10n.assistantLiveBlockedPlanTitle,
    );
    expect(
      assistantLiveErrorLabel(
        l10n,
        AssistantLiveFailure.credits,
        platform: TargetPlatform.android,
      ),
      l10n.assistantLiveFailureCredits,
    );
  });
}
