import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/helpers.dart';

class _Repository extends Mock implements MailRepository {}

void main() {
  for (final status in [500, 403]) {
    testWidgets('read failure $status preserves a concurrent star', (
      tester,
    ) async {
      final repository = _Repository();
      final read = Completer<void>();
      final star = Completer<void>();
      var failures = 0;
      when(
        () => repository.changeState(
          'ws',
          'box',
          'message',
          'mark_read',
          thread: false,
        ),
      ).thenAnswer((_) => read.future);
      when(
        () => repository.changeState(
          'ws',
          'box',
          'message',
          'star',
          thread: false,
        ),
      ).thenAnswer((_) => star.future);
      when(() => repository.denyAccess('ws')).thenAnswer((_) async {});
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
                    'unread': true,
                    'starred': false,
                    'bodyText': 'Message body',
                    'fromAddress': 'sender@example.com',
                  },
                  thread: false,
                  canSend: false,
                  fromAddress: 'test@tuturuuu.com',
                  onReadFailed: () => failures++,
                ),
              ),
            ),
            child: const Text('Open message'),
          ),
        ),
      );
      await tester.tap(find.text('Open message'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Star'));
      await tester.pump();
      expect(find.byTooltip('Remove star'), findsOneWidget);
      read.completeError(ApiException(message: 'Failed', statusCode: status));
      await tester.pumpAndSettle();
      expect(failures, 1);
      if (status == 403) {
        verify(() => repository.denyAccess('ws')).called(1);
        expect(find.byType(MailReader), findsNothing);
      } else {
        expect(find.byTooltip('Remove star'), findsOneWidget);
        expect(find.byType(SnackBar), findsNothing);
        verifyNever(() => repository.denyAccess('ws'));
      }
      star.complete();
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}
