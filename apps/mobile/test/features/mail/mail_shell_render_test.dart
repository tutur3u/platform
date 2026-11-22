import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/shell/view/shell_route_transition.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/design_render_harness.dart';
import '../../helpers/pump_app.dart';
import 'mail_preview_harness.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

const _subject = 'Synthetic alert: new certificate activity for example.test';

/// Inbox rows with unread, starred, labelled and attachment variety.
List<Map<String, dynamic>> _rows() => [
  for (var i = 0; i < 14; i++)
    {
      'id': 'thread-$i',
      'subject': i == 0 ? _subject : 'Synthetic subject $i',
      'participants': [
        {'displayName': 'Sender $i', 'address': 'sender$i@example.invalid'},
      ],
      'latestSnippet':
          'Synthetic snippet $i, long enough to need truncation in a '
          'compact row on a phone.',
      'unreadCount': i % 3 == 0 ? 1 : 0,
      'starred': i % 5 == 1,
      'hasAttachments': i % 4 == 2,
      'labels': [
        if (i.isEven) {'id': 'security', 'name': 'Security'},
      ],
      'lastMessageAt': DateTime.now()
          .subtract(Duration(hours: i * 7 + 1))
          .toUtc()
          .toIso8601String(),
    },
];

Map<String, dynamic> _detail(String id) => {
  'thread': {
    'id': id,
    'subject': id == 'thread-0' ? _subject : 'Synthetic subject',
    'labels': [
      {'id': 'inbox', 'name': 'Inbox'},
      {'id': 'security', 'name': 'Security'},
    ],
  },
  'messages': [
    {
      'id': 'message-$id',
      'fromName': 'Status Bot',
      'fromAddress': 'status@example.invalid',
      'bodyText': [
        'example.test or one of its subdomains has been issued a new cert.',
        'Review the zone certificates if this issuance was not expected.',
        for (var i = 1; i <= 6; i++)
          'Synthetic paragraph $i keeps the reader long enough to scroll.',
      ].join('\n\n'),
      'direction': 'inbound',
      'unread': false,
      'sentAt': DateTime.now()
          .subtract(const Duration(hours: 4))
          .toUtc()
          .toIso8601String(),
      'attachments': <dynamic>[],
      // The synthetic mailbox's own address, so the row reads "to me".
      'recipients': [
        {'kind': 'to', 'address': 'synthetic@example.invalid'},
        {'kind': 'cc', 'address': 'team@example.invalid'},
      ],
    },
  ],
};

/// Mail inside the real shell (top navbar and floating dock), dark, at phone
/// size. Writes PNGs only when `DESIGN_RENDER_DIR` is set.
void main() {
  setUpAll(() async {
    await DesignRender.loadFonts();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('mobile/shell_back'),
          (_) async => null,
        );
  });

  testWidgets('mail inbox, reader and More inside the shell', (tester) async {
    setMailSurface(tester, const Size(390, 844));
    final repository = MailPreviewRepository();
    stubMailPreview(repository, threads: 0);
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
        'threads': _rows(),
        'pagination': {'hasMore': false},
      },
    );
    when(
      () => repository.detail('ws', 'box', any(), thread: true),
    ).thenAnswer((i) async => _detail(i.positionalArguments[2] as String));
    when(
      () => repository.cachedThread(any(), any(), any()),
    ).thenAnswer((i) async => _detail(i.positionalArguments[2] as String));
    when(
      () => repository.refreshThread('ws', 'box', any()),
    ).thenAnswer((i) async => _detail(i.positionalArguments[2] as String));

    final auth = _Auth();
    final workspaces = _Workspaces();
    final profile = _Profile();
    final tabs = AppTabCubit(settingsRepository: SettingsRepository());
    final titles = ShellTitleOverrideCubit();
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.unauthenticated(),
    );
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(),
    );
    whenListen(
      profile,
      const Stream<ShellProfileState>.empty(),
      initialState: const ShellProfileState(),
    );
    final router = GoRouter(
      initialLocation: Routes.mail,
      routes: [
        ShellRoute(
          builder: (context, state, child) => BlocProvider(
            create: (_) => AssistantChromeCubit(),
            child: ShellPage(
              matchedLocation: state.uri.path,
              routePattern: state.fullPath,
              enableDebugLogs: false,
              homePageBuilder: (_) => const SizedBox.shrink(),
              child: child,
            ),
          ),
          routes: shellTransitionRoutes([
            GoRoute(
              path: Routes.home,
              builder: (_, _) => const SizedBox.shrink(),
            ),
            GoRoute(
              path: Routes.mail,
              builder: (_, _) => Navigator(
                onGenerateRoute: (_) => MaterialPageRoute<void>(
                  builder: (_) =>
                      MailWorkspace(workspaceId: 'ws', repository: repository),
                ),
              ),
            ),
          ]),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpAppRouter(
      router,
      brightness: Brightness.dark,
      wrap: (app) => MultiBlocProvider(
        providers: [
          BlocProvider.value(value: tabs),
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
          BlocProvider<ShellProfileCubit>.value(value: profile),
          BlocProvider(create: (_) => ShellMiniNavCubit()),
          BlocProvider.value(value: titles),
          BlocProvider(create: (_) => ShellChromeActionsCubit()),
        ],
        child: RepaintBoundary(key: DesignRenderApp.boundaryKey, child: app),
      ),
    );
    await settleMail(tester);
    expect(tester.takeException(), isNull);
    await DesignRender.capture(tester, 'mail-shell/inbox-dark');

    await tester.tap(find.text(_subject).first);
    await settleMail(tester);
    expect(find.byType(MailReader), findsOneWidget);
    expect(tester.takeException(), isNull);
    expect(find.text('to me +1'), findsOneWidget);
    await DesignRender.capture(tester, 'mail-shell/reader-dark');

    final more = find.byKey(const ValueKey('shell-dock-group-more'));
    if (more.evaluate().isNotEmpty) {
      await tester.tap(more);
      await settleMail(tester);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'mail-shell/more-dark');
    }

    await drain(tester);
    await tabs.close();
    await titles.close();
  });
}
