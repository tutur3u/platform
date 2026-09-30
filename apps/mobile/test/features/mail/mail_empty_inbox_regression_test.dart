import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

Map<String, dynamic> list({bool empty = false, bool extra = false}) => {
  'threads': [
    if (!empty)
      {'id': 'thread', 'subject': 'Last message', 'participants': <dynamic>[]},
    if (extra)
      {'id': 'new', 'subject': 'New arrival', 'participants': <dynamic>[]},
  ],
  'pagination': {'hasMore': false, 'total': (empty ? 0 : 1) + (extra ? 1 : 0)},
};

void main() {
  for (final scenario in [
    (true, false),
    (false, false),
    (true, true),
    (false, true),
  ]) {
    final (success, afterExit) = scenario;
    testWidgets(
      'reader archive settles $success; refresh after exit $afterExit',
      (tester) async {
        SharedPreferences.setMockInitialValues({});
        final repository = _Repository();
        final stale = Completer<Map<String, dynamic>>();
        final reconciliation = Completer<Map<String, dynamic>>();
        final archive = Completer<void>();
        var requests = 0;
        when(() => repository.savedView(any())).thenAnswer((_) async => null);
        when(() => repository.saveView(any(), any())).thenAnswer((_) async {});
        when(() => repository.bootstrap('ws')).thenAnswer(
          (_) async => {
            'mailboxes': [
              {'id': 'box', 'address': 'guest@example.test'},
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
        ).thenAnswer((_) {
          requests++;
          return requests == 1
              ? Future.value(list())
              : requests == 2
              ? stale.future
              : reconciliation.future;
        });
        when(
          () => repository.cachedThread('ws', 'box', 'thread'),
        ).thenAnswer((_) async => null);
        when(
          () => repository.detail('ws', 'box', 'thread', thread: true),
        ).thenAnswer(
          (_) async => {
            'thread': {'id': 'thread', 'subject': 'Last message'},
            'messages': [
              {
                'id': 'message',
                'fromAddress': 'host@example.test',
                'bodyText': 'Synthetic body',
                'unread': false,
              },
            ],
          },
        );
        when(
          () => repository.changeState(
            'ws',
            'box',
            'thread',
            'archive',
            thread: true,
          ),
        ).thenAnswer((_) => archive.future);
        await tester.pumpApp(
          MailWorkspace(workspaceId: 'ws', repository: repository),
        );
        await tester.pumpAndSettle();
        Future<void>? refresh;
        if (!afterExit) {
          refresh = tester
              .widget<NovaRefreshIndicator>(find.byType(NovaRefreshIndicator))
              .onRefresh();
          await tester.pump();
        }
        await tester.tap(find.text('Last message'));
        await tester.pumpAndSettle();
        expect(find.byType(MailReader), findsOneWidget);
        await tester.tap(find.byTooltip('Archive'));
        // Bound the frame wait so the original infinite spinner fails quickly.
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 350));
        expect(find.byType(MailReader), findsNothing);
        expect(find.text('No messages here'), findsOneWidget);
        expect(find.text('Loading'), findsNothing);
        expect(
          requests,
          afterExit ? 1 : 2,
        ); // Reader exit must not reconcile an unsettled archive.
        if (afterExit) {
          refresh = tester
              .widget<NovaRefreshIndicator>(find.byType(NovaRefreshIndicator))
              .onRefresh();
          await tester.pump();
        }
        stale.complete(list(extra: afterExit));
        await refresh;
        await tester.pump();
        expect(find.text('Last message'), findsNothing);
        if (afterExit) expect(find.text('New arrival'), findsOneWidget);
        if (success) {
          archive.complete();
        } else {
          archive.completeError(StateError('Synthetic failure'));
        }
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 20));
        expect(find.text('Loading'), findsNothing);
        reconciliation.complete(list(empty: success, extra: afterExit));
        await tester.pumpAndSettle();
        expect(
          find.text(
            success
                ? (afterExit ? 'New arrival' : 'No messages here')
                : 'Last message',
          ),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
        await tester.pump();
      },
    );
  }
}
