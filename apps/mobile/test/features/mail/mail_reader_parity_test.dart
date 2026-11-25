import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_message_content.dart';
import 'package:mobile/features/mail/view/mail_primary_action_preference.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';

class _Repository extends Mock implements MailRepository {}

Map<String, dynamic> _message(String id, {List<dynamic>? attachments}) => {
  'id': id,
  'fromAddress': '$id@example.test',
  'snippet': 'Snippet of $id',
  'bodyText': 'Body of $id',
  'unread': false,
  'sentAt': '2026-11-17T13:30:00Z',
  if (attachments != null) 'attachments': attachments,
};

Map<String, dynamic> _thread({bool attachments = false}) => {
  'thread': {'id': 'thread', 'subject': 'Quarterly plan'},
  'messages': [
    _message('first'),
    _message(
      'second',
      attachments: attachments
          ? [
              for (final name in ['a', 'b', 'c'])
                {
                  'id': name,
                  'filename': '$name.pdf',
                  'contentType': 'application/pdf',
                  'sizeBytes': 2048,
                },
            ]
          : null,
    ),
    _message('third'),
  ],
};

Future<void> _pump(
  WidgetTester tester, {
  Map<String, dynamic>? detail,
  MailRepository? repository,
  MailPrimaryAction primary = MailPrimaryAction.archive,
  bool adaptiveActions = false,
  bool canSend = false,
  double? width,
  Size surface = const Size(390, 844),
}) async {
  SharedPreferences.setMockInitialValues({});
  tester.view.physicalSize = surface;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final preference = MailPrimaryActionPreference.instance;
  final previous = preference.value;
  preference.value = primary;
  addTearDown(() => preference.value = previous);
  final reader = MailReader(
    repository: repository ?? _Repository(),
    workspaceId: 'ws',
    mailboxId: 'box',
    thread: true,
    canSend: canSend,
    adaptiveActions: adaptiveActions,
    fromAddress: 'me@example.test',
    resolvePeople: (_, _) async => {},
    detail: detail ?? _thread(),
    onClose: () {},
  );
  await tester.pumpApp(
    width == null
        ? reader
        : Align(
            alignment: Alignment.topLeft,
            child: SizedBox(width: width, child: reader),
          ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('only the newest message opens; folded cards show two lines', (
    tester,
  ) async {
    await _pump(tester);
    expect(find.byType(MailMessageContent), findsOneWidget);
    expect(find.text('Body of third'), findsOneWidget);
    final snippets = find.byKey(const ValueKey('mail-message-snippet'));
    expect(snippets, findsNWidgets(2));
    for (final snippet in tester.widgetList<Text>(snippets)) {
      expect(snippet.maxLines, 2);
    }
    expect(
      find.byKey(const ValueKey('mail-message-chevron')),
      findsNWidgets(3),
    );

    await tester.tap(find.text('Snippet of first'));
    await tester.pumpAndSettle();
    expect(find.byType(MailMessageContent), findsNWidgets(2));
    expect(snippets, findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tabs appear only when the conversation has attachments', (
    tester,
  ) async {
    await _pump(tester);
    expect(find.text('Conversation'), findsNothing);
    expect(find.byKey(const ValueKey('mail-reader-tabs')), findsNothing);

    await _pump(tester, detail: _thread(attachments: true));
    expect(find.text('Conversation'), findsOneWidget);
    expect(find.text('Attachments (3)'), findsOneWidget);
    await tester.tap(find.text('Attachments (3)'));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('mail-attachment-grid-1')),
      findsOneWidget,
    );
    expect(find.text('a.pdf'), findsOneWidget);
    expect(find.byType(MailMessageContent), findsNothing);

    await tester.tap(find.text('Conversation'));
    await tester.pumpAndSettle();
    expect(find.byType(MailMessageContent), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('the Attachments grid uses one, two or three columns', () {
    expect(mailAttachmentGridColumns(358), 1);
    expect(mailAttachmentGridColumns(520), 2);
    expect(mailAttachmentGridColumns(700), 3);
  });

  testWidgets('a wide Attachments tab lays files out in three columns', (
    tester,
  ) async {
    await _pump(
      tester,
      detail: _thread(attachments: true),
      surface: const Size(1200, 900),
    );
    await tester.tap(find.text('Attachments (3)'));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('mail-attachment-grid-3')),
      findsOneWidget,
    );
    final a = tester.getRect(find.text('a.pdf'));
    final c = tester.getRect(find.text('c.pdf'));
    expect(a.top, closeTo(c.top, 1));
    expect(tester.takeException(), isNull);
  });

  testWidgets('a mailbox that cannot send keeps read state off the header', (
    tester,
  ) async {
    await _pump(tester, repository: _Repository());
    expect(find.byKey(const ValueKey('mail-reader-actions')), findsOneWidget);
    expect(find.byKey(const ValueKey('mail-reader-read')), findsNothing);
  });

  testWidgets('header actions run the reader mutations', (tester) async {
    final repository = _Repository();
    when(
      () => repository.changeState(
        any(),
        any(),
        any(),
        any(),
        thread: any(named: 'thread'),
      ),
    ).thenAnswer((_) async {});
    await _pump(tester, repository: repository, canSend: true);
    final group = find.byKey(const ValueKey('mail-reader-actions'));
    expect(group, findsOneWidget);
    // Archive is the default action, so the group leaves it to the bar.
    expect(find.byKey(const ValueKey('mail-reader-archive')), findsNothing);

    await tester.tap(find.byKey(const ValueKey('mail-reader-star')));
    await tester.pumpAndSettle();
    verify(
      () => repository.changeState('ws', 'box', 'thread', 'star', thread: true),
    ).called(1);
    expect(find.byTooltip('Remove star'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('mail-reader-read')));
    await tester.pumpAndSettle();
    verify(
      () => repository.changeState(
        'ws',
        'box',
        'thread',
        'mark_unread',
        thread: true,
      ),
    ).called(1);

    await tester.tap(find.byKey(const ValueKey('mail-reader-trash')));
    await tester.pumpAndSettle();
    verify(
      () =>
          repository.changeState('ws', 'box', 'thread', 'trash', thread: true),
    ).called(1);
  });

  testWidgets('header archive and labels use the existing writes', (
    tester,
  ) async {
    final repository = _Repository();
    when(
      () => repository.changeState(
        any(),
        any(),
        any(),
        any(),
        thread: any(named: 'thread'),
      ),
    ).thenAnswer((_) async {});
    when(() => repository.organization('ws', 'box')).thenAnswer(
      (_) async => {
        'labels': [
          {'id': 'finance', 'name': 'Finance'},
        ],
      },
    );
    when(
      () => repository.bulk(
        any(),
        any(),
        any(),
        any(),
        threads: any(named: 'threads'),
        labelId: any(named: 'labelId'),
      ),
    ).thenAnswer((_) async {});
    await _pump(
      tester,
      repository: repository,
      primary: MailPrimaryAction.markUnread,
    );
    // Mark unread is the default action here, so the group offers Archive.
    expect(find.byKey(const ValueKey('mail-reader-read')), findsNothing);

    await tester.tap(find.byKey(const ValueKey('mail-reader-labels')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Finance'));
    await tester.pumpAndSettle();
    verify(
      () => repository.bulk(
        'ws',
        'box',
        ['thread'],
        'add_label',
        threads: true,
        labelId: 'finance',
      ),
    ).called(1);

    await tester.tap(find.byKey(const ValueKey('mail-reader-archive')));
    await tester.pumpAndSettle();
    verify(
      () => repository.changeState(
        'ws',
        'box',
        'thread',
        'archive',
        thread: true,
      ),
    ).called(1);
  });

  for (final (width, labelled) in [(520.0, false), (900.0, true)]) {
    testWidgets('the reply bar ${labelled ? 'labels' : 'collapses'} its '
        'commands at ${width.toInt()}dp', (tester) async {
      await _pump(
        tester,
        canSend: true,
        adaptiveActions: true,
        width: width,
        surface: const Size(1200, 900),
      );
      for (final label in ['Reply', 'Reply all', 'Forward']) {
        expect(find.byTooltip(label), findsWidgets);
        expect(
          find.descendant(
            of: find.byKey(
              ValueKey(
                'mail-bar-${switch (label) {
                  'Reply' => 'reply',
                  'Reply all' => 'replyAll',
                  _ => 'forward',
                }}',
              ),
            ),
            matching: find.text(label),
          ),
          labelled ? findsOneWidget : findsNothing,
        );
      }
      expect(tester.takeException(), isNull);
    });
  }
}
