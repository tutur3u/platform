import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
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

  testWidgets('inbox actions clear while a reader is open and return on back', (
    tester,
  ) async {
    respond((_) async => inbox('First'));
    when(
      () => repository.detail('ws', 'box', 'First', thread: true),
    ).thenAnswer(
      (_) async => {
        'thread': {'id': 'First', 'subject': 'First'},
        'messages': <dynamic>[],
      },
    );
    final actions = ShellChromeActionsCubit();
    final titles = ShellTitleOverrideCubit();
    addTearDown(actions.close);
    addTearDown(titles.close);
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: actions),
          BlocProvider.value(value: titles),
        ],
        child: MaterialApp(
          navigatorKey: navigator,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: MailWorkspace(workspaceId: 'ws', repository: repository),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(actions.state.resolveForLocation(Routes.mail), isNotEmpty);
    await tester.tap(find.text('First'));
    await tester.pumpAndSettle();
    expect(find.byType(MailReader), findsOneWidget);
    expect(actions.state.resolveForLocation(Routes.mail), isEmpty);
    navigator.currentState!.pop();
    await tester.pumpAndSettle();
    expect(actions.state.resolveForLocation(Routes.mail), isNotEmpty);
  });

  testWidgets('archive updates immediately and rolls back a failed request', (
    tester,
  ) async {
    final mutation = Completer<void>();
    respond((_) async => inbox('First'));
    when(
      () => repository.bulk('ws', 'box', any(), 'archive', threads: true),
    ).thenAnswer((_) => mutation.future);
    await mount(tester);
    await tester.pumpAndSettle();
    await tester.longPress(find.text('First'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Archive'));
    await tester.pump();
    expect(find.text('First'), findsNothing);
    mutation.completeError(StateError('Failed'));
    await tester.pumpAndSettle();
    expect(find.text('First'), findsOneWidget);
    await tester.pump(const Duration(seconds: 6));
  });

  testWidgets('tablet Mail controls scroll away with the message list', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(1024, 768);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    respond(
      (_) async => {
        'threads': [
          for (var i = 0; i < 40; i++)
            {'id': '$i', 'subject': 'Subject $i', 'participants': <dynamic>[]},
        ],
        'pagination': {'hasMore': false},
      },
    );
    await mount(tester);
    await tester.pumpAndSettle();
    expect(find.byType(TextField).hitTestable(), findsOneWidget);
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -650));
    await tester.pumpAndSettle();
    expect(find.byType(TextField).hitTestable(), findsNothing);
    expect(tester.takeException(), isNull);
  });

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

  testWidgets('pagination preserves pending organization metadata', (
    tester,
  ) async {
    final metadata = Completer<Map<String, dynamic>>();
    when(
      () => repository.organization('ws', 'box'),
    ).thenAnswer((_) => metadata.future);
    var requests = 0;
    respond(
      (_) async => {
        ...inbox('Page ${++requests}'),
        'pagination': {'hasMore': requests == 1},
      },
    );
    await mount(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Load more'));
    await tester.pumpAndSettle();
    expect(find.text('Page 2'), findsOneWidget);
    metadata.complete({
      'labels': [
        {'id': 'label', 'name': 'Important'},
      ],
      'folders': [
        {'id': 'folder', 'name': 'Projects', 'kind': 'custom'},
      ],
    });
    await tester.pumpAndSettle();
    expect(find.text('All labels and folders'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final kind in ['label', 'folder']) {
    testWidgets('refresh clears a deleted selected $kind', (tester) async {
      var deleted = false;
      when(() => repository.organization('ws', 'box')).thenAnswer(
        (_) async => {
          'labels': [
            if (!deleted && kind == 'label') {'id': 'chosen', 'name': 'Chosen'},
            {'id': 'remaining', 'name': 'Remaining'},
          ],
          'folders': [
            if (!deleted && kind == 'folder')
              {'id': 'chosen', 'name': 'Chosen', 'kind': 'custom'},
          ],
        },
      );
      final filters = <String?>[];
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
      ).thenAnswer((invocation) async {
        final filter =
            invocation.namedArguments[kind == 'label' ? #label : #folderId]
                as String?;
        filters.add(filter);
        return inbox(filter == null ? 'Unfiltered inbox' : 'Filtered inbox');
      });
      await mount(tester);
      await tester.pumpAndSettle();
      await tester.tap(find.text('All labels and folders'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Chosen').last);
      await tester.pumpAndSettle();
      expect(filters.last, 'chosen');
      deleted = true;
      await tester
          .widget<RefreshIndicator>(find.byType(RefreshIndicator))
          .onRefresh();
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(filters.last, isNull);
      expect(find.text('Unfiltered inbox'), findsOneWidget);
      expect(find.text('All labels and folders'), findsOneWidget);
    });
  }

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
