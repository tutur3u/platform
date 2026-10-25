import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/phone_surface.dart';
import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

void main() {
  // These suites cover the compact (pushed reader) flow.
  usePhoneSurface();
  testWidgets(
    'reader awaits one pending detail beyond the old timeout budget',
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
      final detail = Completer<Map<String, dynamic>>();
      var reads = 0;
      when(
        () => repository.detail('ws', 'box', 'message', thread: true),
      ).thenAnswer((_) {
        reads++;
        return detail.future;
      });
      await tester.pumpApp(
        MailWorkspace(workspaceId: 'ws', repository: repository),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Synthetic message'));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 16));
      // The reader opens from the inbox row while its detail is pending.
      expect(find.byType(MailReader), findsOneWidget);
      // Prefetching and opening share one pending read in the preview store.
      final initialReads = reads;
      expect(initialReads, 1);
      // Cross both old 12s deadlines plus the old 350ms retry delay.
      await tester.pump(const Duration(seconds: 12));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(seconds: 13));
      expect(reads, initialReads);
      expect(find.byType(SnackBar), findsNothing);
      expect(
        find.text('Could not open this message. Please try again.'),
        findsNothing,
      );
      when(
        () => repository.changeState(
          'ws',
          'box',
          'message',
          'mark_read',
          thread: true,
        ),
      ).thenAnswer((_) async {});
      detail.complete({
        'thread': {'id': 'message', 'subject': 'Synthetic message'},
        'messages': <dynamic>[],
      });
      await tester.pumpAndSettle();
      expect(find.byType(MailReader), findsOneWidget);
      expect(reads, initialReads);
    },
  );
}
