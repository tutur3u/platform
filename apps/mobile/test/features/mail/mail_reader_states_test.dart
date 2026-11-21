import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_preview_store.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_message_content.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

Map<String, dynamic> _message(String id, {List<dynamic>? attachments}) => {
  'id': id,
  'fromName': 'Sender $id',
  'fromAddress': '$id@example.test',
  'bodyText': 'Body of $id',
  'snippet': 'Snippet of $id',
  'unread': false,
  'sentAt': '2026-11-20T09:00:00Z',
  'recipients': [
    {'kind': 'to', 'address': 'me@example.test'},
    {'kind': 'cc', 'address': 'cc@example.test'},
  ],
  if (attachments != null) 'attachments': attachments,
};

Map<String, dynamic> _thread() => {
  'thread': {
    'id': 'thread',
    'subject': 'Quarterly plan',
    'labels': [
      {'id': 'l1', 'name': 'Finance'},
    ],
  },
  'messages': [
    _message('first'),
    _message(
      'second',
      attachments: [
        {
          'id': 'pdf',
          'filename': 'plan.pdf',
          'contentType': 'application/pdf',
          'sizeBytes': 2048,
        },
      ],
    ),
    _message('third'),
  ],
};

MailReader _reader({
  Map<String, dynamic>? detail,
  Map<String, dynamic>? summary,
  Future<MailPreview> Function()? loadDetail,
  Future<Map<String, Map<String, dynamic>>> Function(String, List<String>)?
  resolvePeople,
  MailRepository? repository,
}) => MailReader(
  repository: repository ?? _Repository(),
  workspaceId: 'ws',
  mailboxId: 'box',
  thread: true,
  canSend: false,
  fromAddress: 'me@example.test',
  detail: detail,
  summary: summary,
  loadDetail: loadDetail,
  resolvePeople: resolvePeople ?? (_, _) async => {},
);

void main() {
  testWidgets('a deep link without a summary opens on a thread skeleton', (
    tester,
  ) async {
    final load = Completer<MailPreview>();
    await tester.pumpApp(
      _reader(summary: const {'id': 'thread'}, loadDetail: () => load.future),
    );
    await tester.pump();
    expect(find.byKey(const ValueKey('mail-thread-skeleton')), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsNothing);
    expect(find.bySemanticsLabel('Loading'), findsOneWidget);
    load.complete((detail: _thread(), fromNetwork: true));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('mail-thread-skeleton')), findsNothing);
    expect(find.text('Body of third'), findsOneWidget);
  });

  testWidgets('a known inbox row shows its sender and snippet over '
      'body placeholders', (tester) async {
    await tester.pumpApp(
      _reader(
        summary: const {
          'id': 'thread',
          'participants': [
            {'displayName': 'Row sender'},
          ],
          'latestSnippet': 'Row snippet',
        },
        loadDetail: () => Completer<MailPreview>().future,
      ),
    );
    await tester.pump();
    expect(find.text('Row sender'), findsOneWidget);
    expect(find.text('Row snippet'), findsOneWidget);
    expect(find.byKey(const ValueKey('mail-thread-skeleton')), findsNothing);
  });

  testWidgets('a failed open shows an inline error that retries', (
    tester,
  ) async {
    var attempts = 0;
    await tester.pumpApp(
      _reader(
        summary: const {'id': 'thread'},
        loadDetail: () async {
          attempts++;
          if (attempts == 1) throw StateError('offline');
          return (detail: _thread(), fromNetwork: true);
        },
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('mail-reader-load-error')),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('mail-thread-skeleton')), findsNothing);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(attempts, 2);
    expect(find.byKey(const ValueKey('mail-reader-load-error')), findsNothing);
    expect(find.text('Body of third'), findsOneWidget);
  });

  testWidgets('a loaded thread has a compact header and folds older mail', (
    tester,
  ) async {
    await tester.pumpApp(_reader(detail: _thread()));
    await tester.pumpAndSettle();
    expect(find.text('3 messages'), findsOneWidget);
    expect(find.text('Finance'), findsOneWidget);
    expect(find.text('1 attachment'), findsOneWidget);
    // The body has no command toolbar or tab control.
    expect(find.byTooltip('Snooze'), findsNothing);
    expect(find.text('Conversation'), findsNothing);
    // Older messages fold to one line; only the newest renders its body.
    expect(find.byKey(const ValueKey('mail-collapsed-first')), findsOneWidget);
    expect(find.byKey(const ValueKey('mail-collapsed-second')), findsOneWidget);
    expect(find.byType(MailMessageContent), findsOneWidget);
    // One To recipient plus a count of the rest.
    expect(find.text('+1'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('mail-attachments-toggle')));
    await tester.pumpAndSettle();
    expect(find.text('plan.pdf'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the recipients line opens the message details sheet', (
    tester,
  ) async {
    await tester.pumpApp(_reader(detail: _thread()));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('mail-recipients-third')));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('mail-details-sheet-third')),
      findsOneWidget,
    );
    expect(find.text('cc@example.test'), findsOneWidget);
  });

  testWidgets('profile lookups retry quietly before offering a retry', (
    tester,
  ) async {
    var lookups = 0;
    await tester.pumpApp(
      _reader(
        detail: _thread(),
        resolvePeople: (_, _) async {
          lookups++;
          throw StateError('lookup failed');
        },
      ),
    );
    await tester.pumpAndSettle();
    // The message reads with addresses while the first retry waits.
    expect(lookups, 1);
    expect(find.byKey(const ValueKey('mail-people-retry')), findsNothing);
    expect(find.text('Body of third'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(lookups, 2);
    expect(find.byKey(const ValueKey('mail-people-retry')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('mail-people-retry')));
    await tester.pumpAndSettle();
    expect(lookups, 3);
  });

  testWidgets('a single message shows no thread count', (tester) async {
    await tester.pumpApp(
      MailReader(
        repository: _Repository(),
        workspaceId: 'ws',
        mailboxId: 'box',
        thread: false,
        canSend: false,
        fromAddress: 'me@example.test',
        resolvePeople: (_, _) async => {},
        detail: _message('only'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('mail-thread-count')), findsNothing);
    expect(find.byKey(const ValueKey('mail-collapsed-only')), findsNothing);
    expect(find.text('Body of only'), findsOneWidget);
  });
}
