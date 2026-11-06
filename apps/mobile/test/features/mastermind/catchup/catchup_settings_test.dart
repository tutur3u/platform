import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/features/mastermind/catchup/catchup_rel_time.dart';
import 'package:mobile/features/mastermind/catchup/catchup_settings.dart';
import 'package:mobile/features/mastermind/catchup/catchup_settings_sheet.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';

final class _RecordingSync implements MorningCatchupSync {
  final applied = <MorningCatchupSettings>[];

  @override
  Future<void> apply(MorningCatchupSettings settings) async =>
      applied.add(settings);
}

void main() {
  setUpAll(initializeDateFormatting);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('MorningCatchupSettingsStore', () {
    test('is off at 08:00 by default and round-trips locally', () async {
      final sync = _RecordingSync();
      final store = MorningCatchupSettingsStore(sync: sync);
      final initial = await store.read();
      expect(initial.enabled, isFalse);
      expect(initial.time, const TimeOfDay(hour: 8, minute: 0));
      await store.write(
        const MorningCatchupSettings(
          enabled: true,
          time: TimeOfDay(hour: 6, minute: 45),
        ),
      );
      final saved = await store.read();
      expect(saved.enabled, isTrue);
      expect(saved.time, const TimeOfDay(hour: 6, minute: 45));
      // The server-sync seam sees every change.
      expect(sync.applied.single.enabled, isTrue);
    });

    test('a damaged time falls back to the default', () async {
      SharedPreferences.setMockInitialValues({
        'mastermind-catchup-morning-time': '99:99',
        'mastermind-catchup-morning-enabled': true,
      });
      final read = await const MorningCatchupSettingsStore().read();
      expect(read.enabled, isTrue);
      expect(read.time, const TimeOfDay(hour: 8, minute: 0));
    });
  });

  testWidgets('the sheet toggles Morning catch-up and shows its time', (
    tester,
  ) async {
    await tester.pumpApp(
      Builder(
        builder: (context) => TextButton(
          onPressed: () => showCatchupSettingsSheet(context),
          child: const Text('open'),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('Morning catch-up'), findsOneWidget);
    expect(find.byKey(const ValueKey('catchup-morning-time')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('catchup-morning-toggle')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('catchup-morning-time')), findsOneWidget);
    expect(find.text('08:00'), findsOneWidget);
    expect((await const MorningCatchupSettingsStore().read()).enabled, isTrue);
  });

  test('the push body is the fixed neutral line, in both languages', () {
    expect(
      AppLocalizationsEn().mastermindCatchupPushBody,
      'Your catch-up is ready',
    );
    expect(AppLocalizationsVi().mastermindCatchupPushBody, isNotEmpty);
  });

  test('relative time buckets follow the design system', () {
    final l10n = AppLocalizationsEn();
    final at = DateTime.utc(2026, 1, 31, 10);
    String text(Duration age) => catchupRelTimeText(l10n, age, at);
    expect(text(const Duration(seconds: 20)), 'now');
    expect(text(const Duration(minutes: 5)), '5m');
    expect(text(const Duration(hours: 2, minutes: 13)), '2h 13m');
    expect(text(const Duration(hours: 2)), '2h');
    expect(text(const Duration(hours: 7, minutes: 13)), '7h');
    expect(text(const Duration(days: 3)), '3d');
    expect(text(const Duration(days: 9)), 'Jan 31');
    expect(text(const Duration(minutes: -5)), 'now');
    expect(
      catchupAbsoluteTime(DateTime.utc(2026, 10, 29, 23, 21), 'en'),
      'Oct 30, 06:21 ICT · Asia/Ho_Chi_Minh',
    );
  });
}
