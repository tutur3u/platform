import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_composer.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';

class MockMailRepository extends Mock implements MailRepository {}

Future<void> openComposer(
  WidgetTester tester,
  MailRepository repository, {
  Map<String, dynamic>? draft,
}) async {
  await tester.pumpWidget(
    const MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: Text('Inbox')),
    ),
  );
  final navigator = Navigator.of(tester.element(find.text('Inbox')));
  unawaited(
    navigator.push(
      MailComposerRoute(
        builder: (_) => MailComposer(
          repository: repository,
          workspaceId: 'ws',
          mailboxId: 'box',
          fromAddress: 'me@tuturuuu.com',
          draft: draft,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('failed back-save keeps the draft and locks edits while saving', (
    tester,
  ) async {
    final repository = MockMailRepository();
    final saving = Completer<Map<String, dynamic>>();
    when(
      () => repository.saveDraft(
        any(),
        any(),
        any(),
        draftId: any(named: 'draftId'),
      ),
    ).thenAnswer((_) => saving.future);
    await openComposer(tester, repository);
    await tester.enterText(find.byType(TextField).at(3), 'Keep this draft');
    unawaited(
      Navigator.of(tester.element(find.byType(MailComposer))).maybePop(),
    );
    await tester.pump();
    expect(
      tester.widget<TextField>(find.byType(TextField).at(3)).enabled,
      isFalse,
    );
    expect(
      tester.widget<QuillEditor>(find.byType(QuillEditor)).controller.readOnly,
      isTrue,
    );
    saving.completeError(StateError('offline'));
    await tester.pumpAndSettle();
    expect(find.text('Keep this draft'), findsOneWidget);
    expect(find.byType(MailComposer), findsOneWidget);
    expect(
      tester.widget<TextField>(find.byType(TextField).at(3)).enabled,
      isTrue,
    );
    verify(
      () => repository.saveDraft(
        any(),
        any(),
        any(),
        draftId: any(named: 'draftId'),
      ),
    ).called(1);
  });

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
    await openComposer(tester, repository);
    await tester.enterText(
      find.byType(TextField).at(0),
      'recipient@example.com',
    );
    await tester.enterText(find.byType(TextField).at(3), 'Unsaved subject');
    await tester.tap(find.text('Send').hitTestable());
    await tester.pumpAndSettle();
    expect(find.text('Unsaved subject'), findsOneWidget);
    expect(find.byType(MailComposer), findsOneWidget);
    verify(() => repository.saveDraft('ws', 'box', any())).called(1);
    verifyNever(() => repository.send(any(), any(), any()));
  });

  testWidgets('reopened draft is updated before sending with same id', (
    tester,
  ) async {
    final repository = MockMailRepository();
    final saving = Completer<Map<String, dynamic>>();
    when(
      () => repository.saveDraft(
        any(),
        any(),
        any(),
        draftId: any(named: 'draftId'),
      ),
    ).thenAnswer((_) => saving.future);
    when(() => repository.send(any(), any(), any())).thenAnswer(
      (_) async => {
        'message': {'id': 'original'},
      },
    );
    await openComposer(
      tester,
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
    );
    await tester.enterText(find.byType(TextField).at(3), 'Updated subject');
    await tester.tap(find.text('Send').hitTestable());
    await tester.pump();
    verifyNever(() => repository.send(any(), any(), any()));
    saving.complete({
      'message': {'id': 'original'},
    });
    await tester.pumpAndSettle();
    final calls = verifyInOrder([
      () =>
          repository.saveDraft('ws', 'box', captureAny(), draftId: 'original'),
      () => repository.send('ws', 'box', captureAny()),
    ]);
    verifyNever(
      () => repository.saveDraft(
        any(),
        any(),
        any(),
        draftId: any(named: 'draftId'),
      ),
    );
    verifyNever(() => repository.send(any(), any(), any()));
    final saved = calls[0].captured.single as Map<String, dynamic>;
    final payload = calls[1].captured.single as Map<String, dynamic>;
    expect(saved['subject'], 'Updated subject');
    expect(payload['subject'], 'Updated subject');
    expect(find.byType(MailComposer), findsNothing);
    expect(find.text('Inbox'), findsOneWidget);
    expect(payload['draftId'], 'original');
    expect(payload['inReplyTo'], '<parent@example.com>');
    expect(payload['references'], ['<parent@example.com>']);
  });
}
