import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_list_retry.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/phone_surface.dart';
import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

const _refreshNotice = "Couldn't refresh. Showing saved mail.";

Map<String, dynamic> _inbox() => {
  'threads': [
    {'id': 'kept', 'subject': 'Kept row', 'participants': <dynamic>[]},
  ],
  'pagination': {'hasMore': false},
};

void main() {
  group('readMailListWithRetry', () {
    test('re-reads after a cancelled read and returns the answer', () async {
      var calls = 0;
      final result = await readMailListWithRetry(() async {
        if (++calls == 1) throw StateError('Mail request was invalidated');
        return 'rows';
      }, isCurrent: () => true);
      expect(result, 'rows');
      expect(calls, 2);
    });

    test('gives up after the allowed cancellations', () async {
      var calls = 0;
      await expectLater(
        readMailListWithRetry<String>(() async {
          calls++;
          throw StateError('Refresh gate closed');
        }, isCurrent: () => true),
        throwsStateError,
      );
      expect(calls, 3);
    });

    test('retries a transient failure once and never a client error', () async {
      var transient = 0;
      await expectLater(
        readMailListWithRetry<String>(
          () async {
            transient++;
            throw const ApiException(message: 'Busy', statusCode: 503);
          },
          isCurrent: () => true,
          transientDelay: Duration.zero,
        ),
        throwsA(isA<ApiException>()),
      );
      expect(transient, 2);

      var client = 0;
      await expectLater(
        readMailListWithRetry<String>(() async {
          client++;
          throw const ApiException(message: 'Bad', statusCode: 400);
        }, isCurrent: () => true),
        throwsA(isA<ApiException>()),
      );
      expect(client, 1);
    });

    test('a stale request stops retrying', () async {
      var calls = 0;
      await expectLater(
        readMailListWithRetry<String>(() async {
          calls++;
          throw StateError('Mail request was invalidated');
        }, isCurrent: () => false),
        throwsStateError,
      );
      expect(calls, 1);
    });

    test('only known cancellations count as benign', () {
      expect(isMailReadInterruption(StateError('Refresh gate closed')), isTrue);
      expect(isMailReadInterruption(StateError('Other')), isFalse);
      expect(isMailReadInterruption(Exception('Refresh gate closed')), isFalse);
    });
  });

  group('MailWorkspace background refresh', () {
    usePhoneSurface();
    late _Repository repository;
    late Future<Map<String, dynamic>> Function() answer;

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      repository = _Repository();
      answer = () async => _inbox();
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
      ).thenAnswer((_) => answer());
    });

    testWidgets('a cancelled refresh over visible rows raises no banner', (
      tester,
    ) async {
      await tester.pumpApp(
        MailWorkspace(workspaceId: 'ws', repository: repository),
      );
      await tester.pumpAndSettle();
      expect(find.text('Kept row'), findsOneWidget);

      answer = () async => throw StateError('Mail request was invalidated');
      await tester.pump(const Duration(minutes: 1));
      await tester.pumpAndSettle();

      expect(find.text('Kept row'), findsOneWidget);
      expect(find.text(_refreshNotice), findsNothing);
      expect(find.text('Something went wrong'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets('a failed refresh keeps rows under a quiet notice', (
      tester,
    ) async {
      await tester.pumpApp(
        MailWorkspace(workspaceId: 'ws', repository: repository),
      );
      await tester.pumpAndSettle();

      answer = () async =>
          throw const ApiException(message: 'Bad request', statusCode: 400);
      await tester.pump(const Duration(minutes: 1));
      await tester.pumpAndSettle();

      expect(find.text('Kept row'), findsOneWidget);
      expect(find.text(_refreshNotice), findsOneWidget);
      expect(find.text('Something went wrong'), findsNothing);

      answer = () async => _inbox();
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text(_refreshNotice), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  });
}
