import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_settings_hub.dart';
import 'package:mobile/features/mail/view/mail_settings_page.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

void main() {
  for (final role in ['owner', 'viewer']) {
    testWidgets('central Mail settings preserves $role rights', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final repository = _Repository();
      when(() => repository.settingsBootstrap('ws')).thenAnswer(
        (_) async => {
          'mailboxes': [
            {'id': 'box', 'address': 'me@example.test', 'role': role},
          ],
        },
      );
      when(
        () => repository.settings('ws', 'box'),
      ).thenAnswer((_) async => {'settings': <String, dynamic>{}});
      await tester.pumpApp(
        MailSettingsHub(
          workspaceId: 'ws',
          locations: const {'/test'},
          isScopeCurrent: () => true,
          repository: repository,
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('me@example.test'));
      await tester.pumpAndSettle();
      expect(find.byType(MailSettingsPage), findsOneWidget);
      final page = tester.widget<MailSettingsPage>(
        find.byType(MailSettingsPage),
      );
      expect(page.repository, same(repository));
      expect(page.canManage, role == 'owner');
      if (role == 'owner') {
        verify(() => repository.settings('ws', 'box')).called(1);
      } else {
        verifyNever(() => repository.settings(any(), any()));
      }
      verify(() => repository.settingsBootstrap('ws')).called(1);
      verifyNever(() => repository.bootstrap(any()));
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
  testWidgets('membership failure never exposes cached mailbox grants', (
    tester,
  ) async {
    final repository = _Repository();
    when(
      () => repository.settingsBootstrap('ws'),
    ).thenThrow(const ApiException(message: 'Denied', statusCode: 403));
    await tester.pumpApp(
      MailSettingsHub(
        workspaceId: 'ws',
        locations: const {'/test'},
        isScopeCurrent: () => true,
        repository: repository,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    expect(find.byType(MailSettingsPage), findsNothing);
    verifyNever(() => repository.bootstrap(any()));
    verifyNever(() => repository.settings(any(), any()));
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
