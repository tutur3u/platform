import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_push_destination.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

Map<String, dynamic> _inbox() => {
  'threads': [
    {'id': 'new', 'subject': 'Background arrival', 'participants': <dynamic>[]},
  ],
  'pagination': {'hasMore': false},
};

void main() {
  late _Repository repository;
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    repository = _Repository();
    when(() => repository.savedView(any())).thenAnswer((_) async => null);
    when(() => repository.saveView(any(), any())).thenAnswer((_) async {});
    when(() => repository.denyAccess(any())).thenAnswer((_) async {});
    when(
      () => repository.cachedThread(any(), any(), any()),
    ).thenAnswer((_) async => null);
    when(
      () => repository.organization('ws', 'box'),
    ).thenAnswer((_) async => {});
    when(() => repository.bootstrap('ws')).thenAnswer(
      (_) async => {
        'mailboxes': [
          {'id': 'box', 'address': 'me@example.test'},
        ],
      },
    );
    when(() => repository.detail('ws', 'box', any(), thread: true)).thenAnswer(
      (_) async => {
        'thread': {'id': 'target', 'subject': 'Notification message'},
        'messages': <dynamic>[],
      },
    );
  });
  void respond(Future<Map<String, dynamic>> Function() callback) {
    when(
      () => repository.list(
        'ws',
        'box',
        folder: any(named: 'folder'),
        query: any(named: 'query'),
        page: any(named: 'page'),
        label: any(named: 'label'),
        folderId: any(named: 'folderId'),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) => callback());
  }

  testWidgets(
    'notification entry retries transient inbox failure before Back',
    (tester) async {
      var requests = 0;
      respond(() async {
        if (++requests == 1) {
          throw const ApiException(message: 'Transient', statusCode: 503);
        }
        return _inbox();
      });
      await tester.pumpApp(
        MailWorkspace(
          workspaceId: 'ws',
          repository: repository,
          destination: const MailPushDestination(
            userId: 'user',
            mailboxId: 'box',
            threadId: 'target',
            notificationId: 'push',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(MailReader), findsOneWidget);
      expect(requests, 2);
      Navigator.of(tester.element(find.byType(MailReader))).pop();
      await tester.pumpAndSettle();
      expect(find.text('Background arrival'), findsOneWidget);
      expect(find.text('Something went wrong'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('inbox refreshes while its reader stays open', (tester) async {
    var requests = 0;
    respond(() async {
      requests++;
      return _inbox();
    });
    await tester.pumpApp(
      MailWorkspace(
        workspaceId: 'ws',
        repository: repository,
        destination: const MailPushDestination(
          userId: 'user',
          mailboxId: 'box',
          threadId: 'target',
          notificationId: 'push',
        ),
      ),
    );
    await tester.pumpAndSettle();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    final before = requests;
    await tester.pump(const Duration(minutes: 1));
    await tester.pumpAndSettle();
    expect(find.byType(MailReader), findsOneWidget);
    expect(requests, greaterThan(before));
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('access denial is not retried and clears the inbox', (
    tester,
  ) async {
    var requests = 0;
    respond(() async {
      requests++;
      throw const ApiException(message: 'Denied', statusCode: 403);
    });
    await tester.pumpApp(
      MailWorkspace(workspaceId: 'ws', repository: repository),
    );
    await tester.pumpAndSettle();
    expect(requests, 1);
    verify(() => repository.denyAccess('ws')).called(1);
    expect(find.text('Something went wrong'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('rate limits are not automatically retried', (tester) async {
    var requests = 0;
    respond(() async {
      requests++;
      throw const ApiException(message: 'Rate limited', statusCode: 429);
    });
    await tester.pumpApp(
      MailWorkspace(workspaceId: 'ws', repository: repository),
    );
    await tester.pumpAndSettle();
    expect(requests, 1);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('notification inbox never exposes saved filtered rows', (
    tester,
  ) async {
    when(() => repository.savedView('ws')).thenAnswer(
      (_) async => {
        'mailboxes': [
          {'id': 'box', 'address': 'me@example.test'},
        ],
        'mailboxId': 'box',
        'folder': 'inbox',
        'query': 'private-filter',
        'listKey': 'filtered-inbox',
        'items': [
          {'id': 'filtered', 'subject': 'Filtered saved row'},
        ],
      },
    );
    final inbox = Completer<Map<String, dynamic>>();
    respond(() => inbox.future);
    await tester.pumpApp(
      MailWorkspace(
        workspaceId: 'ws',
        repository: repository,
        destination: const MailPushDestination(
          userId: 'user',
          mailboxId: 'box',
          threadId: 'target',
          notificationId: 'push',
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(MailReader), findsOneWidget);
    Navigator.of(tester.element(find.byType(MailReader))).pop();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Filtered saved row'), findsNothing);
    inbox.complete(_inbox());
    await tester.pumpAndSettle();
    expect(find.text('Background arrival'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
