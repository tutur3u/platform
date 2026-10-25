import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_composer.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/pump_app.dart';
import 'mail_preview_harness.dart';

const _phone = Size(390, 844);
const _tablet = Size(1194, 834);

Future<MailPreviewRepository> _mount(
  WidgetTester tester, {
  required Size size,
  Set<String> cachedIds = const {},
}) async {
  setMailSurface(tester, size);
  final repository = MailPreviewRepository();
  stubMailPreview(repository, threads: 2, cachedIds: cachedIds);
  await tester.pumpApp(
    MailWorkspace(workspaceId: 'ws', repository: repository),
  );
  // The list resolves; the 250ms prefetch debounce has not fired yet.
  await tester.pump();
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 16));
  return repository;
}

void main() {
  for (final (name, size) in [('phone', _phone), ('tablet', _tablet)]) {
    testWidgets('$name revalidates a body first shown from the snapshot', (
      tester,
    ) async {
      final repository = await _mount(
        tester,
        size: size,
        cachedIds: {'thread-0'},
      );
      when(() => repository.refreshThread('ws', 'box', 'thread-0')).thenAnswer((
        _,
      ) async {
        final result = syntheticDetail('thread-0');
        (result['messages'] as List<Map<String, dynamic>>).first['bodyText'] =
            'Current network body';
        return result;
      });
      await tester.tap(find.text('Synthetic subject 0').first);
      await tester.pumpAndSettle();
      expect(readerText('Current network body'), findsOneWidget);
      verify(() => repository.refreshThread('ws', 'box', 'thread-0')).called(1);
      await drain(tester);
    });

    testWidgets('$name does not refetch a body this open just fetched', (
      tester,
    ) async {
      final repository = await _mount(tester, size: size);
      await tester.tap(find.text('Synthetic subject 0').first);
      await tester.pumpAndSettle();
      expect(readerText('Full body 0'), findsOneWidget);
      verifyNever(() => repository.refreshThread('ws', 'box', 'thread-0'));
      await drain(tester);
    });
  }

  testWidgets('a reopened draft loads its saved version', (tester) async {
    setMailSurface(tester, _phone);
    final repository = MailPreviewRepository();
    stubMailPreview(repository, threads: 1);
    var subject = 'Original draft';
    when(
      () => repository.list(
        'ws',
        'box',
        folder: 'drafts',
        query: any(named: 'query'),
        page: any(named: 'page'),
        label: any(named: 'label'),
        folderId: any(named: 'folderId'),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer(
      (_) async => {
        'messages': [
          {'id': 'draft-0', 'subject': subject},
        ],
        'pagination': {'hasMore': false},
      },
    );
    var draftReads = 0;
    when(
      () => repository.detail('ws', 'box', 'draft-0', thread: false),
    ).thenAnswer((_) async {
      draftReads++;
      return {
        'id': 'draft-0',
        'subject': subject,
        'bodyText': '',
        'recipients': <dynamic>[],
        'attachments': <dynamic>[],
      };
    });
    when(
      () => repository.saveDraft('ws', 'box', any(), draftId: 'draft-0'),
    ).thenAnswer((invocation) async {
      subject = (invocation.positionalArguments[2] as Map)['subject'] as String;
      return {
        'message': {'id': 'draft-0'},
      };
    });
    await tester.pumpApp(
      MailWorkspace(workspaceId: 'ws', repository: repository),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Inbox').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Drafts'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Original draft'));
    await tester.pumpAndSettle();
    expect(find.byType(MailComposer), findsOneWidget);
    final subjectField = find.widgetWithText(TextField, 'Subject');
    await tester.enterText(subjectField, 'Saved edited draft');
    await tester.tap(find.byTooltip('Save draft'));
    await tester.pumpAndSettle();
    expect(subject, 'Saved edited draft');
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byType(MailComposer), findsNothing);
    await tester.tap(find.text('Saved edited draft'));
    await tester.pumpAndSettle();
    expect(draftReads, 2);
    expect(
      tester
          .widget<TextField>(find.widgetWithText(TextField, 'Subject'))
          .controller!
          .text,
      'Saved edited draft',
    );
    await drain(tester);
  });

  testWidgets('switching mailbox closes the pane and Back is released', (
    tester,
  ) async {
    final repository = await _mount(tester, size: _tablet);
    when(() => repository.bootstrap('ws')).thenAnswer(
      (_) async => {
        'mailboxes': [
          {
            'id': 'box',
            'address': 'synthetic@example.invalid',
            'status': 'active',
            'role': 'owner',
          },
          {
            'id': 'box2',
            'address': 'second@example.invalid',
            'status': 'active',
            'role': 'owner',
          },
        ],
      },
    );
    when(
      () => repository.organization('ws', 'box2'),
    ).thenAnswer((_) async => {});
    when(
      () => repository.list(
        'ws',
        'box2',
        folder: any(named: 'folder'),
        query: any(named: 'query'),
        page: any(named: 'page'),
        label: any(named: 'label'),
        folderId: any(named: 'folderId'),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer(
      (_) async => {
        'threads': <dynamic>[],
        'pagination': {'hasMore': false},
      },
    );
    // Remount so bootstrap sees both mailboxes.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpApp(
      MailWorkspace(workspaceId: 'ws', repository: repository),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Synthetic subject 1'));
    await tester.pumpAndSettle();
    expect(find.byType(MailReader), findsOneWidget);

    await tester.tap(find.byTooltip('Mailbox').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('second@example.invalid'));
    await tester.pumpAndSettle();
    expect(find.byType(MailReader), findsNothing);
    expect(find.text('Select a conversation'), findsOneWidget);
    // No hidden selection may intercept Back or reappear on a resize.
    final popScope = tester.widget<PopScope<dynamic>>(
      find
          .descendant(
            of: find.byType(MailWorkspace),
            matching: find.byWidgetPredicate((widget) => widget is PopScope),
          )
          .first,
    );
    expect(popScope.canPop, isTrue);
    tester.view.physicalSize = _phone;
    await tester.pumpAndSettle();
    expect(find.byType(MailReader), findsNothing);
    await drain(tester);
  });
}
