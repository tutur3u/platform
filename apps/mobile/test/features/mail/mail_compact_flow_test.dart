import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_message_tile.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_quick_filter.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/mail/view/mail_rendered_documents.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/phone_surface.dart';
import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

Map<String, dynamic> _list(List<String> subjects) => {
  'threads': [
    for (final subject in subjects)
      {'id': subject, 'subject': subject, 'participants': <dynamic>[]},
  ],
  'pagination': {'hasMore': false},
};

Map<String, dynamic> _detail(String id) => {
  'thread': {'id': id, 'subject': id},
  'messages': [
    {
      'id': '$id-message',
      'fromAddress': 'sender@example.test',
      'bodyText': List.filled(60, 'Body line of $id.').join('\n'),
      'unread': false,
      'recipients': [
        {'kind': 'to', 'address': 'me@tuturuuu.com'},
      ],
    },
  ],
};

void main() {
  usePhoneSurface();
  late _Repository repository;
  final queries = <String>[];
  final savedViews = <Map<String, dynamic>>[];
  final trashed = <String>{};

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    queries.clear();
    savedViews.clear();
    trashed.clear();
    repository = _Repository();
    when(
      () => repository.cachedThread(any(), any(), any()),
    ).thenAnswer((_) async => null);
    when(() => repository.savedView(any())).thenAnswer((_) async => null);
    when(() => repository.saveView(any(), any())).thenAnswer((
      invocation,
    ) async {
      savedViews.add(invocation.positionalArguments[1] as Map<String, dynamic>);
    });
    when(() => repository.bootstrap('ws')).thenAnswer(
      (_) async => {
        'mailboxes': [
          {'id': 'box', 'address': 'me@tuturuuu.com', 'role': 'owner'},
        ],
      },
    );
    when(
      () => repository.organization('ws', 'box'),
    ).thenAnswer((_) async => <String, dynamic>{});
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
      queries.add(invocation.namedArguments[#query] as String);
      return _list([
        for (final subject in ['First', 'Second'])
          if (!trashed.contains(subject)) subject,
      ]);
    });
    when(
      () => repository.detail('ws', 'box', any(), thread: true),
    ).thenAnswer((i) async => _detail(i.positionalArguments[2] as String));
    when(
      () => repository.refreshThread('ws', 'box', any()),
    ).thenAnswer((i) async => _detail(i.positionalArguments[2] as String));
  });

  test('quick filters map onto the list search operators', () {
    expect(mailFilterQuery('  invoice ', MailQuickFilter.all), 'invoice');
    expect(mailFilterQuery('', MailQuickFilter.unread), 'is:unread');
    expect(
      mailFilterQuery('invoice', MailQuickFilter.attachments),
      'invoice has:attachment',
    );
    expect(mailFilterQuery('', MailQuickFilter.starred), 'is:starred');
    expect(MailQuickFilter.parse('unread'), MailQuickFilter.unread);
    expect(MailQuickFilter.parse('nonsense'), MailQuickFilter.all);
    expect(MailQuickFilter.parse(null), MailQuickFilter.all);
  });

  testWidgets('the Unread chip filters through the list query and is saved '
      'with the view', (tester) async {
    await tester.pumpApp(
      MailWorkspace(workspaceId: 'ws', repository: repository),
    );
    await tester.pumpAndSettle();
    expect(queries.last, '');
    await tester.tap(find.byKey(const ValueKey('mail-quick-filter-unread')));
    await tester.pumpAndSettle();
    expect(queries.last, 'is:unread');
    expect(savedViews.last['quickFilter'], 'unread');
    // The typed search stays separate from the filter.
    expect(savedViews.last['query'], '');
    await tester.tap(find.byKey(const ValueKey('mail-quick-filter-all')));
    await tester.pumpAndSettle();
    expect(queries.last, '');
  });

  Future<(ShellChromeActionsCubit, ShellTitleOverrideCubit)> mountShell(
    WidgetTester tester,
  ) async {
    final actions = ShellChromeActionsCubit();
    final titles = ShellTitleOverrideCubit();
    addTearDown(actions.close);
    addTearDown(titles.close);
    // Mail's own navigator sits below the shell cubits, as in the app, so
    // the pushed reader registers its title and actions with them.
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: actions),
          BlocProvider.value(value: titles),
        ],
        child: Navigator(
          onGenerateRoute: (_) => MaterialPageRoute<void>(
            builder: (_) =>
                MailWorkspace(workspaceId: 'ws', repository: repository),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return (actions, titles);
  }

  testWidgets('Delete from More defers its write so Undo cancels cleanly', (
    tester,
  ) async {
    when(
      () => repository.changeState('ws', 'box', 'First', 'trash', thread: true),
    ).thenAnswer((_) async => trashed.add('First'));
    final (actions, _) = await mountShell(tester);
    await tester.tap(find.text('First'));
    await tester.pumpAndSettle();
    expect(find.byType(MailReader), findsOneWidget);

    final group = actions.state.actionGroupForLocation(Routes.mail)!;
    final delete = group.more.last.single as ShellDockGroupAction;
    expect(delete.id, 'trash');
    delete.onPressed!();
    await tester.pumpAndSettle();

    expect(find.byType(MailReader), findsNothing);
    verifyNever(
      () => repository.changeState('ws', 'box', 'First', 'trash', thread: true),
    );
    expect(find.text('First'), findsNothing);
    expect(find.text('Moved to Trash'), findsOneWidget);
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    verifyNever(
      () => repository.changeState('ws', 'box', 'First', 'trash', thread: true),
    );
    verifyNever(
      () => repository.bulk('ws', 'box', ['First'], 'restore', threads: true),
    );
    expect(find.text('First'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Delete from More commits once the Undo window closes', (
    tester,
  ) async {
    when(
      () => repository.changeState('ws', 'box', 'First', 'trash', thread: true),
    ).thenAnswer((_) async => trashed.add('First'));
    final (actions, _) = await mountShell(tester);
    await tester.tap(find.text('First'));
    await tester.pumpAndSettle();

    final group = actions.state.actionGroupForLocation(Routes.mail)!;
    final delete = group.more.last.single as ShellDockGroupAction;
    delete.onPressed!();
    await tester.pumpAndSettle();
    verifyNever(
      () => repository.changeState('ws', 'box', 'First', 'trash', thread: true),
    );

    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    verify(
      () => repository.changeState('ws', 'box', 'First', 'trash', thread: true),
    ).called(1);
    expect(find.text('First'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('slow swipe feedback waits until returning to the list', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'mail.swipe.left': 'read',
      'mail.swipe.right': 'trash',
    });
    final pendingMarkRead = Completer<void>();
    when(
      () => repository.bulk('ws', 'box', ['First'], 'mark_read', threads: true),
    ).thenAnswer((_) => pendingMarkRead.future);
    when(
      () =>
          repository.bulk('ws', 'box', ['First'], 'mark_unread', threads: true),
    ).thenAnswer((_) async {});
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
    ).thenAnswer((_) async {
      return {
        'threads': [
          {
            'id': 'First',
            'subject': 'First',
            'unread': true,
            'participants': <dynamic>[],
          },
          {
            'id': 'Second',
            'subject': 'Second',
            'unread': false,
            'participants': <dynamic>[],
          },
        ],
        'pagination': {'hasMore': false},
      };
    });

    await mountShell(tester);
    await tester.drag(find.text('First'), const Offset(-260, 0));
    await tester.pump();
    await tester.tap(find.text('Second'));
    await tester.pumpAndSettle();
    expect(find.byType(MailReader), findsOneWidget);

    pendingMarkRead.complete();
    await tester.pump();
    // Feedback stays pending until the reader closes back to the list.
    expect(find.text('Undo'), findsNothing);

    Navigator.of(tester.element(find.byType(MailReader))).pop();
    await tester.pumpAndSettle();
    expect(find.text('Undo'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('quick filter does not leak into Drafts', (tester) async {
    final folderQueries = <(String, String)>[];
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
      folderQueries.add((
        invocation.namedArguments[#folder] as String,
        invocation.namedArguments[#query] as String,
      ));
      return _list(['First']);
    });
    await tester.pumpApp(
      MailWorkspace(workspaceId: 'ws', repository: repository),
    );
    await tester.pumpAndSettle();
    final attachmentsChip = find.byKey(
      const ValueKey('mail-quick-filter-attachments'),
    );
    await tester.ensureVisible(attachmentsChip);
    await tester.pumpAndSettle();
    await tester.tap(attachmentsChip);
    await tester.pumpAndSettle();
    expect(folderQueries.last, ('inbox', 'has:attachment'));

    await tester.tap(find.byTooltip('Inbox').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Drafts').last);
    await tester.pumpAndSettle();
    expect(folderQueries.last, ('drafts', ''));
    expect(
      find.byKey(const ValueKey('mail-quick-filter-attachments')),
      findsNothing,
    );
  });

  testWidgets('three long inbox badges do not overflow at 320dp and 2x text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.pumpApp(
      Material(
        child: MailMessageTile(
          workspaceId: 'ws',
          thread: true,
          selected: false,
          onTap: () {},
          onSelect: () {},
          item: const {
            'id': 'row-1',
            'subject': 'Quarterly review follow-up and checklist',
            'participants': [
              {'displayName': 'Sender Name', 'address': 's@example.test'},
            ],
            'labels': [
              {'name': 'Very Long Label One'},
              {'name': 'Very Long Label Two'},
            ],
            'deliveryRecipient': 'catchall-delivery@very-long-domain.example',
            'latestSnippet': 'Snippet preview',
            'unread': true,
          },
        ),
      ),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
    final rect = tester.getRect(find.byType(MailMessageTile));
    expect(rect.right, lessThanOrEqualTo(320.5));
  });

  testWidgets('collapsing a scrolled message returns navbar title to folder', (
    tester,
  ) async {
    final twoMessageThread = {
      'thread': {'id': 'First', 'subject': 'First'},
      'messages': [
        {
          'id': 'm1',
          'fromAddress': 'earlier@example.test',
          'bodyText': 'Earlier line',
          'unread': false,
        },
        {
          'id': 'm2',
          'fromAddress': 'middle@example.test',
          'bodyText': 'Middle line',
          'unread': false,
        },
        {
          'id': 'm3',
          'fromAddress': 'latest@example.test',
          'bodyText': List.filled(80, 'Long expanded message line.').join('\n'),
          'unread': false,
        },
      ],
    };
    when(
      () => repository.detail('ws', 'box', 'First', thread: true),
    ).thenAnswer((_) async => twoMessageThread);
    when(
      () => repository.refreshThread('ws', 'box', 'First'),
    ).thenAnswer((_) async => twoMessageThread);
    final (_, titles) = await mountShell(tester);
    await tester.tap(find.text('First'));
    await tester.pumpAndSettle();
    expect(titles.state.resolveForLocation(Routes.mail), 'Inbox');

    await tester.drag(
      find
          .descendant(
            of: find.byType(MailReader),
            matching: find.byType(Scrollable),
          )
          .first,
      const Offset(0, -150),
    );
    await tester.pumpAndSettle();
    expect(titles.state.resolveForLocation(Routes.mail), 'First');

    // Collapse the long message so Flutter clamps scroll metrics back to 0.
    await tester.tap(find.text('latest@example.test'));
    await tester.pumpAndSettle();
    expect(titles.state.resolveForLocation(Routes.mail), 'Inbox');
  });

  testWidgets('the navbar names the folder, then the subject once its '
      'heading scrolls away', (tester) async {
    final (_, titles) = await mountShell(tester);
    await tester.tap(find.text('First'));
    await tester.pumpAndSettle();
    expect(titles.state.resolveForLocation(Routes.mail), 'Inbox');
    expect(find.byKey(const ValueKey('mail-reader-subject')), findsOneWidget);

    await tester.drag(
      find
          .descendant(
            of: find.byType(MailReader),
            matching: find.byType(Scrollable),
          )
          .first,
      const Offset(0, -400),
    );
    await tester.pumpAndSettle();
    expect(titles.state.resolveForLocation(Routes.mail), 'First');

    await tester.drag(
      find
          .descendant(
            of: find.byType(MailReader),
            matching: find.byType(Scrollable),
          )
          .first,
      const Offset(0, 600),
    );
    await tester.pumpAndSettle();
    expect(titles.state.resolveForLocation(Routes.mail), 'Inbox');
  });
  for (final unreadFilter in [false, true]) {
    testWidgets('the next conversation renders ahead, so its body is ready in '
        "the reader's first frame (Unread filter: $unreadFilter)", (
      tester,
    ) async {
      InAppWebViewPlatform.instance = _WebViews();
      Map<String, dynamic> html(String id) => {
        'thread': {'id': id, 'subject': id},
        'messages': [
          {
            'id': '$id-message',
            'fromAddress': 'sender@example.test',
            'bodyText': 'Body of $id',
            'bodyHtml': '<p>Body of $id</p>',
            'unread': false,
          },
        ],
      };
      when(
        () => repository.detail('ws', 'box', any(), thread: true),
      ).thenAnswer((i) async => html(i.positionalArguments[2] as String));
      when(
        () => repository.refreshThread('ws', 'box', any()),
      ).thenAnswer((i) async => html(i.positionalArguments[2] as String));
      final runs = <String>[];
      final documents = MailRenderedDocuments(
        renderer: (request) async {
          runs.add(request.html);
          return '<html>${request.html}</html>';
        },
      );
      addTearDown(documents.dispose);
      await tester.pumpApp(
        MailWorkspace(
          workspaceId: 'ws',
          repository: repository,
          renderedDocuments: documents,
        ),
      );
      await tester.pumpAndSettle();
      expect(runs, isEmpty);
      if (unreadFilter) {
        // Opening takes the row out of this filter's list.
        await tester.tap(
          find.byKey(const ValueKey('mail-quick-filter-unread')),
        );
        await tester.pumpAndSettle();
      }

      await tester.tap(find.text('First'));
      await tester.pumpAndSettle();
      expect(find.byType(InAppWebView), findsOneWidget);
      // The opened body rendered once, and its neighbour rendered ahead.
      expect(
        runs,
        unorderedEquals(['<p>Body of First</p>', '<p>Body of Second</p>']),
      );

      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Second'));
      // The frame that first builds the pushed reader already has its body.
      var frames = 0;
      while (find.byType(MailReader).evaluate().isEmpty && frames < 30) {
        await tester.pump(const Duration(milliseconds: 8));
        frames++;
      }
      expect(find.byType(InAppWebView), findsOneWidget);
      expect(runs, hasLength(2));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}

class _WebViews extends InAppWebViewPlatform {
  @override
  PlatformInAppWebViewWidget createPlatformInAppWebViewWidget(
    PlatformInAppWebViewWidgetCreationParams params,
  ) => _WebView(params);
}

class _WebView extends PlatformInAppWebViewWidget {
  _WebView(super.params) : super.implementation();

  @override
  Widget build(BuildContext context) => const SizedBox.expand();

  @override
  T controllerFromPlatform<T>(PlatformInAppWebViewController controller) =>
      throw UnimplementedError();

  @override
  void dispose() {}
}
