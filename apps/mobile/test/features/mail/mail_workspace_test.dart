import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';

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
    repository = _Repository();
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

  Future<void> mount(WidgetTester tester) => tester.pumpWidget(
    MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: MailWorkspace(workspaceId: 'ws', repository: repository),
    ),
  );

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

  testWidgets('slow folder metadata does not block inbox or refresh', (
    tester,
  ) async {
    final metadata = Completer<Map<String, dynamic>>();
    when(
      () => repository.organization('ws', 'box'),
    ).thenAnswer((_) => metadata.future);
    final refresh = Completer<Map<String, dynamic>>();
    var requests = 0;
    respond(
      (_) => ++requests == 1
          ? Future.value(inbox('Existing message'))
          : refresh.future,
    );
    await mount(tester);
    await tester.pumpAndSettle();
    expect(find.text('Existing message'), findsOneWidget);
    final refreshFuture = tester
        .widget<RefreshIndicator>(find.byType(RefreshIndicator))
        .onRefresh();
    await tester.pump();
    expect(find.text('Existing message'), findsOneWidget);
    refresh.complete(inbox('Updated message'));
    await refreshFuture;
    await tester.pumpAndSettle();
    expect(find.text('Updated message'), findsOneWidget);
    metadata.complete({});
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('search debounces typing and ignores older responses', (
    tester,
  ) async {
    final old = Completer<Map<String, dynamic>>();
    final queries = <String>[];
    respond((query) {
      queries.add(query);
      return query == 'old'
          ? old.future
          : Future.value(inbox(query.isEmpty ? 'Inbox message' : query));
    });
    await mount(tester);
    await tester.pumpAndSettle();
    final search = find.byType(TextField);
    await tester.enterText(search, 'o');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(search, 'old');
    await tester.pump(const Duration(milliseconds: 301));
    expect(queries, ['', 'old']);
    await tester.enterText(search, 'new result');
    await tester.pump(const Duration(milliseconds: 301));
    await tester.pump();
    old.complete(inbox('Stale result'));
    await tester.pumpAndSettle();
    expect(find.text('Stale result'), findsNothing);
    expect(find.text('new result'), findsWidgets);
    expect(queries, ['', 'old', 'new result']);
  });
}
