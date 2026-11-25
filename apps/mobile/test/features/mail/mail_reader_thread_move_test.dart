import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/helpers.dart';

class _Repository extends Mock implements MailRepository {}

const _folders = <Map<String, dynamic>>[
  {'id': 'folder-1', 'name': 'Receipts', 'kind': 'custom'},
];

Map<String, dynamic> _message(Object? id, {String? folder}) => {
  'id': id,
  'fromAddress': 'sender@example.test',
  'bodyText': 'Body $id',
  'unread': false,
  'starred': false,
  if (folder != null) 'folder': folder,
};

Map<String, dynamic> _thread(List<Map<String, dynamic>> messages) => {
  'thread': {
    'id': 'thread',
    'subject': 'Whole conversation',
    'lastMessageAt': '2026-11-22T08:00:00.000Z',
  },
  'messages': messages,
};

void main() {
  late _Repository repository;
  late List<String> optimistic;

  setUp(() {
    repository = _Repository();
    optimistic = [];
    when(
      () => repository.bulk(
        any(),
        any(),
        any(),
        any(),
        threads: any(named: 'threads'),
        folderId: any(named: 'folderId'),
      ),
    ).thenAnswer((_) async {});
  });

  Future<void> openThread(
    WidgetTester tester,
    List<Map<String, dynamic>> messages,
  ) async {
    await tester.pumpApp(
      Builder(
        builder: (context) => TextButton(
          onPressed: () => Navigator.of(context).push<void>(
            MaterialPageRoute(
              builder: (_) => MailReader(
                repository: repository,
                workspaceId: 'ws',
                mailboxId: 'box',
                detail: _thread(messages),
                thread: true,
                canSend: false,
                fromAddress: 'test@tuturuuu.com',
                sourceFolder: 'inbox',
                folders: _folders,
                onOptimisticAction: (action, id) =>
                    optimistic.add('$action:$id'),
              ),
            ),
          ),
          child: const Text('Open thread'),
        ),
      ),
    );
    await tester.tap(find.text('Open thread'));
    await tester.pumpAndSettle();
  }

  Future<void> moveToReceipts(WidgetTester tester) async {
    await tester.tap(find.byTooltip('Show menu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Move'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Receipts'));
    await tester.pumpAndSettle();
  }

  testWidgets('moving a thread sends every message id as messages', (
    tester,
  ) async {
    await openThread(tester, [_message('m1'), _message('m2'), _message('m3')]);

    await moveToReceipts(tester);

    verify(
      () => repository.bulk(
        'ws',
        'box',
        ['m1', 'm2', 'm3'],
        'move_to_folder',
        threads: false,
        folderId: 'folder-1',
      ),
    ).called(1);
    expect(optimistic, ['move_to_folder:thread']);
    expect(find.byType(MailReader), findsNothing);
  });

  testWidgets('a thread loaded with only some messages moves those', (
    tester,
  ) async {
    await openThread(tester, [_message('m4')]);

    await moveToReceipts(tester);

    verify(
      () => repository.bulk(
        'ws',
        'box',
        ['m4'],
        'move_to_folder',
        threads: false,
        folderId: 'folder-1',
      ),
    ).called(1);
  });

  testWidgets('messages filed in other folders move with the thread', (
    tester,
  ) async {
    await openThread(tester, [
      _message('inbox-message', folder: 'inbox'),
      _message('sent-message', folder: 'sent'),
      _message('archived-message', folder: 'archive'),
    ]);

    await moveToReceipts(tester);

    verify(
      () => repository.bulk(
        'ws',
        'box',
        ['inbox-message', 'sent-message', 'archived-message'],
        'move_to_folder',
        threads: false,
        folderId: 'folder-1',
      ),
    ).called(1);
  });

  testWidgets('a thread with no messages sends nothing and stays open', (
    tester,
  ) async {
    await openThread(tester, const []);

    await moveToReceipts(tester);

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
    expect(optimistic, isEmpty);
    expect(find.byType(MailReader), findsOneWidget);
  });

  test('rows without a string id are not sent as message ids', () {
    // Rendering rejects such rows, so the filter is exercised at its boundary.
    expect(
      mailMessageIds([
        _message('m1'),
        _message(null),
        _message(7),
        {'bodyText': 'No id at all'},
        _message('m4'),
      ]),
      ['m1', 'm4'],
    );
    expect(mailMessageIds(const []), isEmpty);
  });
}
