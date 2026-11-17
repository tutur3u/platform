import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

void main() {
  testWidgets('all displayed identities enter the scoped lookup', (
    tester,
  ) async {
    final requested = <String>[];
    await tester.pumpApp(
      MailReader(
        repository: _Repository(),
        workspaceId: 'ws',
        mailboxId: 'box',
        thread: false,
        canSend: false,
        fromAddress: 'me@example.test',
        resolvePeople: (workspace, emails) async {
          expect(workspace, 'ws');
          requested.addAll(emails);
          return {
            for (final email in emails)
              email: {
                'kind': 'member',
                'emailVisible': false,
                'displayName': 'Visible',
              },
          };
        },
        detail: const {
          'id': 'message',
          'subject': 'Identity boundary',
          'fromAddress': 'sender@example.test',
          'bodyText': 'Message body',
          'unread': false,
          'observedRecipient': 'original@example.test',
          'safeHeaders': {'reply-to': 'PRIVATE@example.test'},
          'recipients': [
            {'kind': 'to', 'address': 'to@example.test'},
          ],
        },
      ),
    );
    await tester.pumpAndSettle();
    expect(
      requested,
      containsAll([
        'sender@example.test',
        'original@example.test',
        'PRIVATE@example.test',
        'to@example.test',
      ]),
    );
    await tester.tap(find.text('Message details'));
    await tester.pumpAndSettle();
    expect(find.text('PRIVATE@example.test'), findsNothing);
    expect(find.text('original@example.test'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pending automatic read disables duplicate manual writes', (
    tester,
  ) async {
    final repository = _Repository();
    final read = Completer<void>();
    when(
      () => repository.changeState(
        'ws',
        'box',
        'message',
        'mark_read',
        thread: false,
      ),
    ).thenAnswer((_) => read.future);
    await tester.pumpApp(
      MailReader(
        repository: repository,
        workspaceId: 'ws',
        mailboxId: 'box',
        thread: false,
        canSend: false,
        fromAddress: 'me@example.test',
        resolvePeople: (_, _) async => {},
        detail: const {
          'id': 'message',
          'subject': 'Read state',
          'fromAddress': 'sender@example.test',
          'bodyText': 'Message body',
          'unread': true,
        },
      ),
    );
    await tester.pumpAndSettle();
    final button = find.widgetWithIcon(
      IconButton,
      Icons.mark_email_read_outlined,
    );
    expect(tester.widget<IconButton>(button).onPressed, isNull);
    verify(
      () => repository.changeState(
        'ws',
        'box',
        'message',
        'mark_read',
        thread: false,
      ),
    ).called(1);
    // The standalone More menu shares the read-state fence with the dock.
    await tester.tap(find.byTooltip('Show menu'));
    await tester.pumpAndSettle();
    final sheet = tester.widget<AppActionSheet<String>>(
      find.byType(AppActionSheet<String>),
    );
    expect(sheet.title, 'Read state');
    expect(
      sheet.actions
          .singleWhere((action) => action.value == 'mark_read')
          .enabled,
      isFalse,
    );
    expect(
      sheet.actions.where((action) => action.value == 'unsnooze'),
      isEmpty,
    );
    expect(sheet.actions.where((action) => action.value == 'restore'), isEmpty);
    expect(sheet.actions.where((action) => action.value == 'reply'), isEmpty);
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    verifyNever(
      () => repository.changeState(
        'ws',
        'box',
        'message',
        'mark_unread',
        thread: false,
      ),
    );
    read.complete();
    await tester.pumpAndSettle();
    expect(tester.widget<IconButton>(button).onPressed, isNotNull);
    expect(find.byTooltip('Mark unread'), findsWidgets);
  });
  for (final oldCompletesFirst in [true, false]) {
    testWidgets(
      'refresh supersedes profile lookup oldFirst=$oldCompletesFirst',
      (tester) async {
        final repository = _Repository();
        final refresh = Completer<Map<String, dynamic>>();
        final oldPeople = Completer<Map<String, Map<String, dynamic>>>();
        final newPeople = Completer<Map<String, Map<String, dynamic>>>();
        final lookups = <List<String>>[];
        when(
          () => repository.refreshThread('ws', 'box', 'thread'),
        ).thenAnswer((_) => refresh.future);
        Map<String, dynamic> detail(String sender) => {
          'thread': {'id': 'thread', 'subject': 'Refreshed thread'},
          'messages': [
            {
              'id': sender,
              'fromAddress': '$sender@example.test',
              'bodyText': 'Message',
              'unread': false,
            },
          ],
        };
        await tester.pumpApp(
          MailReader(
            repository: repository,
            workspaceId: 'ws',
            mailboxId: 'box',
            thread: true,
            canSend: false,
            fromAddress: 'me@example.test',
            detail: detail('old'),
            refreshOnOpen: true,
            resolvePeople: (_, emails) {
              lookups.add(emails);
              return lookups.length == 1 ? oldPeople.future : newPeople.future;
            },
          ),
        );
        await tester.pumpAndSettle();
        final oldResult = {
          'old@example.test': <String, dynamic>{
            'emailVisible': false,
            'displayName': 'Old profile',
          },
        };
        final newResult = {
          'new@example.test': <String, dynamic>{
            'emailVisible': false,
            'displayName': 'New profile',
          },
        };
        refresh.complete(detail('new'));
        await tester.pumpAndSettle();
        expect(lookups, hasLength(2));
        expect(lookups.last, contains('new@example.test'));
        if (oldCompletesFirst) {
          oldPeople.complete(oldResult);
          await tester.pumpAndSettle();
        }
        newPeople.complete(newResult);
        await tester.pumpAndSettle();
        if (!oldCompletesFirst) {
          oldPeople.complete(oldResult);
          await tester.pumpAndSettle();
        }
        expect(find.text('New profile'), findsOneWidget);
        expect(find.text('Old profile'), findsNothing);
        expect(find.text('new@example.test'), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
