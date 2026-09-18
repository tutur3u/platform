import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_composer.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';

class MockMailRepository extends Mock implements MailRepository {}

Widget app(
  MailRepository repository, {
  Map<String, dynamic>? draft,
  Map<String, dynamic>? reply,
}) => MaterialApp(
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: MailComposer(
    repository: repository,
    workspaceId: 'ws',
    mailboxId: 'box',
    fromAddress: 'me@tuturuuu.com',
    draft: draft,
    reply: reply,
  ),
);

void main() {
  testWidgets('save failure preserves editor and does not send', (
    tester,
  ) async {
    final repository = MockMailRepository();
    when(
      () => repository.saveDraft(
        any(),
        any(),
        any(),
        draftId: any(named: 'draftId'),
      ),
    ).thenThrow(StateError('offline'));
    await tester.pumpWidget(app(repository));
    await tester.enterText(
      find.byType(TextField).at(0),
      'recipient@example.com',
    );
    await tester.enterText(find.byType(TextField).at(3), 'Unsaved subject');
    await tester.tap(find.byTooltip('Send'));
    await tester.pumpAndSettle();
    expect(find.text('Unsaved subject'), findsOneWidget);
    expect(find.byType(MailComposer), findsOneWidget);
    verifyNever(() => repository.send(any(), any(), any()));
  });

  testWidgets('reopened draft is updated before sending with same id', (
    tester,
  ) async {
    final repository = MockMailRepository();
    when(
      () => repository.saveDraft(
        any(),
        any(),
        any(),
        draftId: any(named: 'draftId'),
      ),
    ).thenAnswer(
      (_) async => {
        'message': {'id': 'original'},
      },
    );
    when(() => repository.send(any(), any(), any())).thenAnswer(
      (_) async => {
        'message': {'id': 'original'},
      },
    );
    await tester.pumpWidget(
      app(
        repository,
        draft: {
          'id': 'original',
          'subject': 'Saved',
          'bodyText': 'Hello',
          'recipients': [
            {'kind': 'to', 'address': 'recipient@example.com'},
          ],
          'attachments': <dynamic>[],
          'inReplyTo': '<parent@example.com>',
          'references': ['<parent@example.com>'],
        },
      ),
    );
    await tester.tap(find.byTooltip('Send'));
    await tester.pumpAndSettle();
    verify(
      () => repository.saveDraft('ws', 'box', any(), draftId: 'original'),
    ).called(1);
    final payload =
        verify(() => repository.send('ws', 'box', captureAny())).captured.single
            as Map<String, dynamic>;
    expect(payload['draftId'], 'original');
    expect(payload['inReplyTo'], '<parent@example.com>');
    expect(payload['references'], ['<parent@example.com>']);
  });
}
