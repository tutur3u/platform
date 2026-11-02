import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/feature_flags/mobile_flags.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/reminders/reminder_service.dart';
import 'package:mobile/features/reminders/reminder_settings.dart';
import 'package:mobile/features/reminders/reminder_settings_page.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Offline extends HttpOverrides {
  int attempts = 0;
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    attempts++;
    throw const SocketException('offline');
  }
}

void main() {
  for (final enabled in [false, true]) {
    testWidgets('Reminders opens offline with flag=$enabled', (tester) async {
      SharedPreferences.setMockInitialValues({
        'reminders.user.tasksEnabled': false,
        'reminders.user.eventsEnabled': true,
        'reminders.user.eventOffsets': ['5m'],
      });
      final service = ReminderService.instance;
      final original = service.settings;
      final previousOverrides = HttpOverrides.current;
      final offline = _Offline();
      HttpOverrides.global = offline;
      final flags =
          MobileFlags(
              fetch: (_, _) async => null,
              networkEvents: const Stream.empty(),
            )
            ..debugOverride = {
              MobileFlag.mobileOffline: true,
              MobileFlag.offlineReadReminders: enabled,
            };
      try {
        service.settings = (await tester.runAsync(
          () => ReminderSettings.load('user'),
        ))!;
        expect(flags.enabled(MobileFlag.offlineReadReminders), enabled);
        await tester.pumpWidget(
          RepositoryProvider.value(
            value: flags,
            child: MaterialApp(
              theme: AppTheme.light,
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              home: const Scaffold(body: ReminderSettingsPage()),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.byType(AppToggleRow), findsNWidgets(2));
        expect(find.byType(AppChip), findsNWidgets(5));
        expect(service.settings.tasksEnabled, isFalse);
        expect(service.settings.eventsEnabled, isTrue);
        expect(tester.takeException(), isNull);
        expect(offline.attempts, 0);
        await tester.pumpWidget(const SizedBox());
      } finally {
        service.settings = original;
        HttpOverrides.global = previousOverrides;
        await tester.runAsync(flags.close);
      }
    });
  }
}
