import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_move_destinations.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/helpers.dart';

class _Repository extends Mock implements MailRepository {}

const _folders = <Map<String, dynamic>>[
  {'id': 'folder-1', 'name': 'Receipts', 'kind': 'custom'},
  {'id': 'folder-2', 'name': 'Travel', 'kind': 'custom'},
  {'id': 'system', 'name': 'Sent', 'kind': 'system'},
  {'id': '', 'name': 'No id', 'kind': 'custom'},
  {'id': 'folder-3', 'name': '  ', 'kind': 'custom'},
];

void main() {
  group('mailMoveDestinations', () {
    List<String> labels(
      String? source, [
      List<Map<String, dynamic>>? folders,
    ]) => [
      for (final item in mailMoveDestinations(
        sourceFolder: source,
        folders: folders ?? _folders,
      ))
        item.name ?? item.action,
    ];

    test('lists system destinations and only well-formed custom folders', () {
      expect(labels('sent'), [
        'restore',
        'archive',
        'trash',
        'Receipts',
        'Travel',
      ]);
    });

    test('never lists the folder the message is already in', () {
      expect(labels('inbox'), ['archive', 'trash', 'Receipts', 'Travel']);
      expect(labels('archive'), ['restore', 'trash', 'Receipts', 'Travel']);
      expect(labels('trash'), ['restore', 'archive', 'Receipts', 'Travel']);
      expect(labels('folder-1'), ['restore', 'archive', 'trash', 'Travel']);
      expect(labels('folder:folder-2'), [
        'restore',
        'archive',
        'trash',
        'Receipts',
      ]);
    });

    test('mailboxes without custom folders still offer system moves', () {
      expect(labels('inbox', const []), ['archive', 'trash']);
    });
  });

  Future<void> openReader(
    WidgetTester tester,
    _Repository repository, {
    String? sourceFolder = 'inbox',
    List<Map<String, dynamic>> folders = _folders,
    List<String>? optimistic,
    List<bool>? settled,
  }) async {
    await tester.pumpApp(
      Builder(
        builder: (context) => TextButton(
          onPressed: () => Navigator.of(context).push<void>(
            MaterialPageRoute(
              builder: (_) => MailReader(
                repository: repository,
                workspaceId: 'ws',
                mailboxId: 'box',
                detail: const {
                  'id': 'message',
                  'subject': 'Test message',
                  'unread': false,
                  'starred': false,
                  'bodyText': 'Message body',
                  'fromAddress': 'sender@example.com',
                },
                thread: false,
                canSend: false,
                fromAddress: 'test@tuturuuu.com',
                sourceFolder: sourceFolder,
                folders: folders,
                onOptimisticAction: (action, id) =>
                    optimistic?.add('$action:$id'),
                onActionSettled:
                    ({required action, required id, required success}) =>
                        settled?.add(success),
              ),
            ),
          ),
          child: const Text('Open message'),
        ),
      ),
    );
    await tester.tap(find.text('Open message'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Show menu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Move'));
    await tester.pumpAndSettle();
  }

  testWidgets('Move lists the mailbox folders and moves to the chosen one', (
    tester,
  ) async {
    final repository = _Repository();
    final optimistic = <String>[];
    final settled = <bool>[];
    when(
      () => repository.bulk(
        'ws',
        'box',
        ['message'],
        'move_to_folder',
        threads: false,
        folderId: 'folder-1',
      ),
    ).thenAnswer((_) async {});

    await openReader(
      tester,
      repository,
      optimistic: optimistic,
      settled: settled,
    );

    expect(find.text('Receipts'), findsOneWidget);
    expect(find.text('Travel'), findsOneWidget);
    expect(find.text('Sent'), findsNothing);
    expect(find.text('No id'), findsNothing);
    expect(find.text('Archive'), findsWidgets);

    await tester.tap(find.text('Receipts'));
    await tester.pumpAndSettle();

    verify(
      () => repository.bulk(
        'ws',
        'box',
        ['message'],
        'move_to_folder',
        threads: false,
        folderId: 'folder-1',
      ),
    ).called(1);
    expect(find.byType(MailReader), findsNothing);
    expect(optimistic, ['move_to_folder:message']);
    expect(settled, [true]);
  });

  testWidgets('a failed move reports failure to the owning view', (
    tester,
  ) async {
    final repository = _Repository();
    final settled = <bool>[];
    when(
      () => repository.bulk(
        any(),
        any(),
        any(),
        any(),
        threads: any(named: 'threads'),
        folderId: any(named: 'folderId'),
      ),
    ).thenThrow(const ApiException(message: 'boom', statusCode: 500));

    await openReader(tester, repository, settled: settled);
    await tester.tap(find.text('Travel'));
    await tester.pumpAndSettle();

    expect(settled, [false]);
    expect(tester.takeException(), isNull);
  });

  testWidgets('system destinations reuse the existing mutations', (
    tester,
  ) async {
    final repository = _Repository();
    when(
      () => repository.changeState(
        'ws',
        'box',
        'message',
        'trash',
        thread: false,
      ),
    ).thenAnswer((_) async {});

    await openReader(tester, repository);
    await tester.tap(find.text('Trash').last);
    await tester.pumpAndSettle();

    verify(
      () => repository.changeState(
        'ws',
        'box',
        'message',
        'trash',
        thread: false,
      ),
    ).called(1);
    verifyNever(
      () => repository.bulk(
        any(),
        any(),
        any(),
        any(),
        threads: any(named: 'threads'),
        folderId: any(named: 'folderId'),
      ),
    );
  });

  testWidgets('Move is unavailable for quarantined mail', (tester) async {
    final repository = _Repository();
    await tester.pumpApp(
      MailReader(
        repository: repository,
        workspaceId: 'ws',
        mailboxId: 'box',
        detail: const {
          'id': 'message',
          'subject': 'Held',
          'status': 'quarantined',
          'bodyText': 'Body',
          'fromAddress': 'sender@example.com',
        },
        thread: false,
        canSend: false,
        fromAddress: 'test@tuturuuu.com',
        folders: _folders,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Show menu'));
    await tester.pumpAndSettle();
    expect(find.text('Move'), findsNothing);
  });
}
