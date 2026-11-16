import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/settings/view/settings_delete_account_row.dart';
import 'package:mobile/features/settings/view/settings_tile.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../helpers/helpers.dart';

void main() {
  test('deletion page is the public tuturuuu.com route', () {
    expect(
      accountDeletionUri.toString(),
      'https://tuturuuu.com/account/delete',
    );
  });

  test('label is translated in English and Vietnamese', () {
    expect(
      lookupAppLocalizations(const Locale('en')).settingsDeleteAccount,
      'Delete account',
    );
    expect(
      lookupAppLocalizations(const Locale('vi')).settingsDeleteAccount,
      'Xóa tài khoản',
    );
  });

  testWidgets('opens the deletion page in the in-app browser', (tester) async {
    final calls = <(Uri, LaunchMode)>[];
    await tester.pumpApp(
      Scaffold(
        body: SettingsDeleteAccountRow(
          launch: (uri, mode) async {
            calls.add((uri, mode));
            return true;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    final tile = tester.widget<SettingsTile>(find.byType(SettingsTile));
    expect(tile.isDestructive, isTrue);
    expect(find.text('Delete account'), findsOneWidget);

    await tester.tap(find.text('Delete account'));
    await tester.pumpAndSettle();

    expect(calls, [(accountDeletionUri, LaunchMode.inAppBrowserView)]);
  });

  testWidgets('reports a launch failure without leaving Settings', (
    tester,
  ) async {
    await tester.pumpApp(
      Scaffold(body: SettingsDeleteAccountRow(launch: (_, _) async => false)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Delete account'));
    await tester.pump();

    expect(
      find.text('Could not open this link. Please try again.'),
      findsOneWidget,
    );
    expect(find.text('Delete account'), findsOneWidget);
    await tester.pumpAndSettle(const Duration(seconds: 6));
  });
}
