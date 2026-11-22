import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/phone_surface.dart';
import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

/// A Mail view over a small fake server: an Inbox holding `First` and
/// `Second`, with swipe right set to Delete and swipe left to read/unread.
class MailDeferredFixture {
  late MailRepository repository;
  final savedViews = <Map<String, dynamic>>[];
  // Server state the list answers from.
  final trashed = <String>{};
  final read = <String>{};
  final starred = <String>{};
  // The latest message time the server reports per conversation.
  final activity = <String, String>{};
  // Requests in the order the server receives them.
  final events = <String>[];
  bool hasMore = false;
  bool listFails = false;
  bool detailUnread = false;

  /// Leaves the latest message time off list rows, as for a conversation
  /// opened from a notification before its row is known.
  bool rowsOmitActivity = false;

  /// While set, list requests wait on it before the server answers.
  Completer<void>? listGate;

  /// Pins a phone surface and rebuilds the fake before every test.
  void register() {
    usePhoneSurface();
    setUp(_reset);
  }

  Future<void> trashFirst() =>
      repository.bulk('ws', 'box', ['First'], 'trash', threads: true);

  Map<String, dynamic> savedRow(String id) => (savedViews.last['items'] as List)
      .cast<Map<String, dynamic>>()
      .firstWhere((item) => item['id'] == id);

  void _reset() {
    SharedPreferences.setMockInitialValues({
      'mail.swipe.left': 'read',
      'mail.swipe.right': 'trash',
    });
    savedViews.clear();
    trashed.clear();
    read.clear();
    starred.clear();
    activity.clear();
    events.clear();
    hasMore = false;
    listFails = false;
    detailUnread = false;
    rowsOmitActivity = false;
    listGate = null;
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
    when(() => repository.denyAccess(any())).thenAnswer((_) async {});
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
      final query = invocation.namedArguments[#query] as String;
      events.add('list');
      await listGate?.future;
      if (listFails) throw StateError('Offline');
      return {
        'threads': [
          for (final id in ['First', 'Second'])
            if (!trashed.contains(id) &&
                !(query.contains('is:unread') && read.contains(id)) &&
                !(query.contains('is:starred') && !starred.contains(id)))
              {
                'id': id,
                'subject': id,
                'unread': !read.contains(id),
                'starred': starred.contains(id),
                if (!rowsOmitActivity)
                  'lastMessageAt': activity[id] ?? '2026-11-22T08:00:00.000Z',
                'participants': <dynamic>[],
              },
        ],
        'pagination': {'hasMore': hasMore},
      };
    });
    Map<String, dynamic> detail(String id) => {
      'thread': {
        'id': id,
        'subject': id,
        'lastMessageAt': activity[id] ?? '2026-11-22T08:00:00.000Z',
      },
      'messages': [
        {
          'id': '$id-message',
          'fromAddress': 'sender@example.test',
          'bodyText': 'Body of $id',
          'unread': detailUnread,
          'starred': starred.contains(id),
        },
      ],
    };
    when(
      () => repository.detail('ws', 'box', any(), thread: true),
    ).thenAnswer((i) async => detail(i.positionalArguments[2] as String));
    when(
      () => repository.refreshThread('ws', 'box', any()),
    ).thenAnswer((i) async => detail(i.positionalArguments[2] as String));
  }

  /// Adds a second mailbox, `team`, whose Inbox holds the unread `Other`.
  void addTeamMailbox() {
    when(() => repository.bootstrap('ws')).thenAnswer(
      (_) async => {
        'mailboxes': [
          {'id': 'box', 'address': 'me@tuturuuu.com', 'role': 'owner'},
          {'id': 'team', 'address': 'team@tuturuuu.com', 'role': 'owner'},
        ],
      },
    );
    when(
      () => repository.organization('ws', 'team'),
    ).thenAnswer((_) async => <String, dynamic>{});
    when(
      () => repository.list(
        'ws',
        'team',
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
            'id': 'Other',
            'subject': 'Other',
            'unread': true,
            'participants': <dynamic>[],
          },
        ],
        'pagination': {'hasMore': false},
      },
    );
  }

  Future<void> mount(
    WidgetTester tester, {
    String? Function()? currentUserId,
  }) async {
    await tester.pumpApp(
      currentUserId == null
          ? MailWorkspace(workspaceId: 'ws', repository: repository)
          : MailWorkspace(
              workspaceId: 'ws',
              repository: repository,
              currentUserId: currentUserId,
            ),
    );
    await tester.pumpAndSettle();
  }

  // Mail's own navigator sits below the shell cubits, as in the app, so the
  // pushed reader registers its actions with them.
  Future<ShellChromeActionsCubit> mountShell(
    WidgetTester tester, {
    ShellMiniNavCubit? miniNav,
  }) async {
    final actions = ShellChromeActionsCubit();
    final titles = ShellTitleOverrideCubit();
    addTearDown(actions.close);
    addTearDown(titles.close);
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: actions),
          BlocProvider.value(value: titles),
          if (miniNav != null) BlocProvider.value(value: miniNav),
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
    return actions;
  }

  Future<void> deleteFromReader(
    WidgetTester tester,
    ShellChromeActionsCubit actions,
  ) async {
    final group = actions.state.actionGroupForLocation(Routes.mail)!;
    (group.more.last.single as ShellDockGroupAction).onPressed!();
    await tester.pumpAndSettle();
    expect(find.byType(MailReader), findsNothing);
  }

  Future<void> swipeFirstToTrash(WidgetTester tester) async {
    await tester.drag(find.text('First'), const Offset(260, 0));
    await tester.pumpAndSettle();
    expect(find.text('Moved to Trash'), findsOneWidget);
    expect(find.text('Undo'), findsOneWidget);
    verifyNever(trashFirst);
  }
}
