import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

void main() {
  testWidgets(
    'closing inbox during transport retry never starts a new detail request',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final repository = _Repository();
      when(
        () => repository.cachedThread(any(), any(), any()),
      ).thenAnswer((_) async => null);
      when(() => repository.savedView(any())).thenAnswer((_) async => null);
      when(() => repository.saveView(any(), any())).thenAnswer((_) async {});
      when(() => repository.bootstrap('ws')).thenAnswer(
        (_) async => {
          'mailboxes': [
            {'id': 'box', 'address': 'synthetic@example.invalid'},
          ],
        },
      );
      when(
        () => repository.organization('ws', 'box'),
      ).thenAnswer((_) async => {});
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
        (_) async => {
          'threads': [
            {
              'id': 'message',
              'subject': 'Synthetic message',
              'participants': <dynamic>[],
            },
          ],
          'pagination': {'hasMore': false},
        },
      );
      var reads = 0;
      when(
        () => repository.detail('ws', 'box', 'message', thread: true),
      ).thenAnswer((_) async {
        reads++;
        if (reads == 2) {
          throw const ApiException.transport(message: 'Request timed out');
        }
        return {
          'thread': {'id': 'message', 'subject': 'Synthetic message'},
          'messages': <dynamic>[],
        };
      });
      await tester.pumpApp(
        MailWorkspace(workspaceId: 'ws', repository: repository),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Synthetic message'));
      await tester.pump();
      expect(reads, 2);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 400));
      expect(reads, 2);
      expect(tester.takeException(), isNull);
    },
  );
}
