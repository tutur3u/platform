import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_push_destination.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_image_preference.dart';
import 'package:mobile/features/mail/view/mail_message_content.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

Map<String, dynamic> inbox(String subject) => {
  'threads': [
    {'id': subject, 'subject': subject, 'participants': <dynamic>[]},
  ],
  'pagination': {'hasMore': false},
};

void main() {
  late _Repository repository;
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    repository = _Repository();
    when(
      () => repository.cachedThread(any(), any(), any()),
    ).thenAnswer((_) async => null);
    when(() => repository.savedView(any())).thenAnswer((_) async => null);
    when(() => repository.saveView(any(), any())).thenAnswer((_) async {});
    when(() => repository.denyAccess(any())).thenAnswer((_) async {});
    when(() => repository.bootstrap('ws')).thenAnswer(
      (_) async => {
        'mailboxes': [
          {'id': 'box', 'address': 'me@tuturuuu.com'},
        ],
      },
    );
    when(
      () => repository.organization('ws', 'box'),
    ).thenAnswer((_) async => <String, dynamic>{});
  });

  void respond(Future<Map<String, dynamic>> Function(String query) callback) {
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
    ).thenAnswer(
      (invocation) => callback(invocation.namedArguments[#query] as String),
    );
  }

  testWidgets('push waits for mailbox access before opening its thread', (
    tester,
  ) async {
    final bootstrap = Completer<Map<String, dynamic>>();
    when(() => repository.bootstrap('ws')).thenAnswer((_) => bootstrap.future);
    respond((_) async => inbox('Inbox'));
    when(
      () => repository.detail('ws', 'box', 'target', thread: true),
    ).thenAnswer(
      (_) async => {
        'thread': {'id': 'target', 'subject': 'Pushed message'},
        'messages': [
          {
            'id': 'pushed-message',
            'fromAddress': 'sender@example.invalid',
            'bodyText': 'Private body',
            'unread': false,
          },
        ],
      },
    );
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
    await tester.pump();
    verifyNever(() => repository.detail('ws', 'box', 'target', thread: true));
    bootstrap.complete({
      'mailboxes': [
        {'id': 'box', 'address': 'me@tuturuuu.com', 'status': 'active'},
      ],
    });
    await tester.pumpAndSettle();
    verify(
      () => repository.detail('ws', 'box', 'target', thread: true),
    ).called(1);
    expect(find.byType(MailReader), findsOneWidget);
    expect(
      tester
          .widget<MailMessageContent>(find.byType(MailMessageContent))
          .imagesVisible,
      isFalse,
    );
    expect(MailImagePreference.instance.value, isTrue);
    final before = await SharedPreferences.getInstance();
    final saved = before.getBool(MailImagePreference.storageKey);
    tester
        .widget<MailMessageContent>(find.byType(MailMessageContent))
        .onImagesChanged!(true);
    await tester.pump();
    expect(
      tester
          .widget<MailMessageContent>(find.byType(MailMessageContent))
          .imagesVisible,
      isTrue,
    );
    expect(before.getBool(MailImagePreference.storageKey), saved);
    tester
        .widget<MailMessageContent>(find.byType(MailMessageContent))
        .onImagesChanged!(false);
    await tester.pump();
    expect(
      tester
          .widget<MailMessageContent>(find.byType(MailMessageContent))
          .imagesVisible,
      isFalse,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('failed push open retains image suppression on explicit retry', (
    tester,
  ) async {
    respond((_) async => inbox('Inbox'));
    var attempts = 0;
    when(
      () => repository.detail('ws', 'box', 'target', thread: true),
    ).thenAnswer((_) async {
      attempts++;
      if (attempts < 3) {
        throw const ApiException(message: 'Unavailable', statusCode: 503);
      }
      return {
        'thread': {'id': 'target', 'subject': 'Target'},
        'messages': [
          {
            'id': 'message',
            'fromAddress': 'sender@example.invalid',
            'bodyText': 'Private body',
            'unread': false,
          },
        ],
      };
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
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 250));
    expect(attempts, 2);
    expect(
      find.text('Could not open this message. Please try again.'),
      findsOneWidget,
    );
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(attempts, 3);
    expect(
      tester
          .widget<MailMessageContent>(find.byType(MailMessageContent))
          .imagesVisible,
      isFalse,
    );
    expect(MailImagePreference.instance.value, isTrue);
    expect(tester.takeException(), isNull);
  });
}
