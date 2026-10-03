import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/view/profile_activity_section.dart';
import 'package:mobile/features/profile/view/profile_overview_page.dart';
import 'package:mobile/features/profile/view/profile_timeline_browser.dart';
import 'package:mobile/features/profile/view/profile_timeline_section.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

Future<void> _pump(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  late AppTabCubit apps;
  late ExperimentalAppsCubit experiments;
  late _Auth auth;
  late _Workspaces workspaces;
  late _Profile profile;
  late GoRouter router;
  var textScale = 2.0;
  late Directory fixtureDirectory;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    await supa.Supabase.initialize(
      url: 'https://synthetic.supabase.test',
      publishableKey: 'synthetic-test-key',
      authOptions: const supa.FlutterAuthClientOptions(
        autoRefreshToken: false,
        detectSessionInUri: false,
        localStorage: supa.EmptyLocalStorage(),
      ),
    );
    FlutterSecureStorage.setMockInitialValues({});
    fixtureDirectory = await Directory.systemTemp.createTemp('profile-navbar-');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          (_) async => fixtureDirectory.path,
        );
    await CacheStore.instance.init();
    final materialFont = Platform.environment['PROFILE_MATERIAL_FONT'];
    if (materialFont != null) {
      final loader = FontLoader('Roboto')
        ..addFont(File(materialFont).readAsBytes().then(ByteData.sublistView));
      await loader.load();
    }
    final manifest =
        jsonDecode(await rootBundle.loadString('FontManifest.json'))
            as List<dynamic>;
    for (final entry in manifest.cast<Map<String, dynamic>>()) {
      final loader = FontLoader(entry['family'] as String);
      for (final font
          in (entry['fonts'] as List<dynamic>).cast<Map<String, dynamic>>()) {
        loader.addFont(rootBundle.load(font['asset'] as String));
      }
      await loader.load();
    }
  });

  tearDownAll(() async {
    await CacheStore.instance.closeForTesting();
    await fixtureDirectory.delete(recursive: true);
    await supa.Supabase.instance.dispose();
  });

  setUp(() async {
    textScale = 2;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('mobile/shell_back'),
          (_) async => null,
        );
    SharedPreferences.setMockInitialValues({});
    apps = AppTabCubit(settingsRepository: SettingsRepository());
    experiments = ExperimentalAppsCubit(
      settingsRepository: SettingsRepository(),
    );
    await experiments.load();
    auth = _Auth();
    workspaces = _Workspaces();
    profile = _Profile();
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.unauthenticated().copyWith(
        activeAccountId: 'a',
        accounts: const [
          StoredAuthAccount(
            id: 'a',
            refreshToken: '',
            lastActiveAt: 1,
            addedAt: 1,
            displayName: 'Account A',
          ),
          StoredAuthAccount(
            id: 'b',
            refreshToken: '',
            lastActiveAt: 2,
            addedAt: 2,
            displayName: 'Account B',
          ),
        ],
      ),
    );
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        currentWorkspace: Workspace(id: 'synthetic-personal', personal: true),
      ),
    );
    whenListen(
      profile,
      const Stream<ShellProfileState>.empty(),
      initialState: const ShellProfileState(error: 'Offline'),
    );
    when(() => auth.syncCurrentSessionToStore()).thenAnswer((_) async {});
    when(() => auth.switchAccount('b')).thenAnswer((_) async => true);
    router = GoRouter(
      initialLocation: Routes.profileRoot,
      routes: [
        ShellRoute(
          builder: (context, state, child) => ShellPage(
            matchedLocation: state.uri.path,
            enableDebugLogs: false,
            child: child,
          ),
          routes: [
            GoRoute(path: Routes.apps, builder: (_, _) => const SizedBox()),
            GoRoute(path: Routes.home, builder: (_, _) => const SizedBox()),
            GoRoute(
              path: Routes.profileRoot,
              builder: (_, _) => const ProfileOverviewPage(),
            ),
            GoRoute(
              path: Routes.profileEdit,
              builder: (_, _) => const Text('Identity editor'),
            ),
            GoRoute(
              path: Routes.settings,
              builder: (_, _) => const Text('Preferences page'),
            ),
          ],
        ),
      ],
    );
  });
  tearDown(() async {
    router.dispose();
    await apps.close();
    await experiments.close();
    await auth.close();
    await workspaces.close();
    await profile.close();
  });

  Future<void> mount(
    WidgetTester tester, {
    Size size = const Size(430, 844),
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = size;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: apps),
          BlocProvider.value(value: experiments),
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
          BlocProvider<ShellProfileCubit>.value(value: profile),
          BlocProvider(create: (_) => AssistantChromeCubit()),
          BlocProvider(create: (_) => ShellMiniNavCubit()),
          BlocProvider(create: (_) => ShellTitleOverrideCubit()),
          BlocProvider(create: (_) => ShellChromeActionsCubit()),
        ],
        child: RepaintBoundary(
          key: const ValueKey('synthetic-profile-render'),
          child: shad.ShadcnApp.router(
            theme: MobileShadTheme.light,
            darkTheme: MobileShadTheme.dark,
            themeMode: shad.ThemeMode.dark,
            localizationsDelegates: const [
              ...AppLocalizations.localizationsDelegates,
              shad.ShadcnLocalizations.delegate,
            ],
            supportedLocales: AppLocalizations.supportedLocales,
            builder: (context, child) => ShadcnMaterialBridge.appBuilder(
              context,
              MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(textScale)),
                child: child!,
              ),
            ),
            routerConfig: router,
          ),
        ),
      ),
    );
    await _pump(tester);
  }

  for (final scale in [1.0, 2.0, 3.0]) {
    testWidgets(
      'authenticated Profile compact selector stays in navbar at scale $scale',
      (tester) async {
        textScale = scale;
        await tester.runAsync(CacheStore.instance.init);
        const user = supa.User(
          id: 'synthetic-owner',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '',
        );
        whenListen(
          auth,
          const Stream<AuthState>.empty(),
          initialState: const AuthState.authenticated(user),
        );
        whenListen(
          profile,
          const Stream<ShellProfileState>.empty(),
          initialState: const ShellProfileState(
            userId: 'synthetic-owner',
            profile: UserProfile(
              id: 'synthetic-owner',
              displayName: 'Synthetic Person',
              email: 'synthetic@example.test',
            ),
          ),
        );
        final requests = <String>[];
        final client = MockClient((request) async {
          requests.add(request.url.path);
          if (request.url.path.endsWith('/time-tracker/stats')) {
            return http.Response(
              jsonEncode({
                'todayTime': 3600,
                'weekTime': 10800,
                'monthTime': 21600,
                'dailyActivity': <Map<String, Object?>>[],
              }),
              200,
            );
          }
          if (request.url.path.endsWith('/mobile-activity')) {
            return http.Response(
              jsonEncode({
                'items': [
                  {
                    'id': 'synthetic-task',
                    'type': 'task',
                    'title': 'Synthetic task creation',
                    'createdAt': DateTime.now().toUtc().toIso8601String(),
                    'scope': 'personal',
                  },
                ],
                'partial': false,
                'limited': false,
              }),
              200,
            );
          }
          return http.Response('{}', 200);
        });
        final header = base64Url.encode(
          utf8.encode(jsonEncode({'alg': 'none'})),
        );
        final payload = base64Url.encode(
          utf8.encode(
            jsonEncode({
              'sub': user.id,
              'exp': DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600,
            }),
          ),
        );
        final syntheticToken = '$header.$payload.synthetic';
        await tester.runAsync(
          () => supa.Supabase.instance.client.auth.setInitialSession(
            jsonEncode({
              'access_token': syntheticToken,
              'refresh_token': 'synthetic-refresh',
              'token_type': 'bearer',
              'expires_in': 3600,
              'expires_at':
                  DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600,
              'user': user.toJson(),
            }),
          ),
        );
        await http.runWithClient(() async {
          await mount(
            tester,
            size: scale == 3 ? const Size(320, 852) : const Size(393, 854),
          );
          await _pump(tester);
          await tester.runAsync(() async {
            await Future<void>.delayed(const Duration(milliseconds: 300));
          });
          await _pump(tester);
          expect(find.text('Synthetic Person'), findsOneWidget);
          final overviewScroll = find.descendant(
            of: find
                .descendant(
                  of: find.byType(ProfileOverviewPage),
                  matching: find.byType(ListView),
                )
                .first,
            matching: find.byType(Scrollable),
          );
          // The default test font and capture font have different heights.
          // Mount the lazy activity section by its actual position, not pixels.
          await tester.scrollUntilVisible(
            find.byType(ProfileActivitySection),
            200,
            scrollable: overviewScroll.first,
            maxScrolls: 15,
          );
          for (
            var attempt = 0;
            attempt < 60 && find.text('60 min tracked').evaluate().isEmpty;
            attempt++
          ) {
            await tester.runAsync(() async {
              await Future<void>.delayed(const Duration(milliseconds: 50));
            });
            await tester.pump(const Duration(milliseconds: 50));
          }
          expect(
            find.text('60 min tracked'),
            findsOneWidget,
            reason: 'Mounted activity must render the fetched value: $requests',
          );
          // Reverse user scrolling to reveal the shell's hiding header;
          // jumpTo alone changes offset without reversing its chrome state.
          await tester.drag(overviewScroll.first, const Offset(0, 200));
          await _pump(tester);
          tester
              .state<ScrollableState>(overviewScroll.first)
              .position
              .jumpTo(0);
          await _pump(tester);
          Future<void> verifyAndCapture(String view) async {
            final selector = find.byKey(const ValueKey('profile-views'));
            expect(selector, findsOneWidget);
            final navbar = find.ancestor(
              of: selector,
              matching: find.byType(shad.AppBar),
            );
            expect(navbar, findsOneWidget);
            final navRect = tester.getRect(navbar);
            final selectorRect = tester.getRect(selector);
            expect(selectorRect.width, lessThanOrEqualTo(110));
            expect(selectorRect.height, lessThanOrEqualTo(56));
            expect(navRect.contains(selectorRect.topLeft), isTrue);
            expect(navRect.contains(selectorRect.bottomRight), isTrue);
            expect(
              find.descendant(
                of: find.byType(ProfileOverviewPage),
                matching: selector,
              ),
              findsNothing,
            );
            expect(
              find.descendant(of: selector, matching: find.byType(IconButton)),
              findsNWidgets(2),
            );
            final output = Platform.environment['PROFILE_RENDER_DIR'];
            if (output != null) {
              await tester
                  .runAsync(() async {
                    final boundary = tester.renderObject<RenderRepaintBoundary>(
                      find.byKey(const ValueKey('synthetic-profile-render')),
                    );
                    final image = await boundary.toImage();
                    final bytes = await image.toByteData(
                      format: ui.ImageByteFormat.png,
                    );
                    await Directory(output).create(recursive: true);
                    await File(
                      '$output/profile-$view-$scale.png',
                    ).writeAsBytes(bytes!.buffer.asUint8List());
                    await File(
                      '$output/profile-$view-$scale.json',
                    ).writeAsString(
                      jsonEncode({
                        'synthetic': true,
                        'logicalWidth': tester.view.physicalSize.width,
                        'logicalHeight': tester.view.physicalSize.height,
                        'textScale': scale,
                        'navbar': navRect.toString(),
                        'selector': selectorRect.toString(),
                        'duplicateInlineSelector': false,
                      }),
                    );
                    image.dispose();
                  })
                  .timeout(const Duration(seconds: 10));
            }
          }

          await verifyAndCapture('overview');
          // Render an explicitly synthetic scoped stored creation record.
          await tester.runAsync(
            () => CacheStore.instance.write(
              key: const CacheKey(
                namespace: 'profile.timeline',
                workspaceId: 'synthetic-personal',
                userId: 'synthetic-owner',
              ),
              policy: CachePolicies.summary,
              payload: {
                'version': 1,
                'items': [
                  {
                    'id': 'synthetic-task',
                    'type': 'task',
                    'title': 'Synthetic task creation',
                    'createdAt': DateTime.now().toUtc().toIso8601String(),
                    'scope': 'personal',
                  },
                ],
                'partial': false,
                'limited': false,
              },
            ),
          );
          final timelineTarget = find.byTooltip('Activity timeline');
          expect(tester.getCenter(timelineTarget).dy, greaterThan(0));
          await tester.tap(timelineTarget);
          await _pump(tester);
          await tester.runAsync(() async {
            await Future<void>.delayed(const Duration(milliseconds: 300));
          });
          await _pump(tester);
          if (scale == 3 &&
              find.byType(ProfileTimelineSection).evaluate().isEmpty) {
            await tester.drag(
              find
                  .descendant(
                    of: find.byType(ProfileOverviewPage),
                    matching: find.byType(ListView),
                  )
                  .first,
              const Offset(0, -400),
            );
            await _pump(tester);
            await tester.runAsync(() async {
              await Future<void>.delayed(const Duration(milliseconds: 300));
            });
            await _pump(tester);
          }
          expect(find.byType(ProfileTimelineSection), findsOneWidget);
          expect(
            find.text('Synthetic task creation'),
            findsOneWidget,
            reason: 'Requests: $requests',
          );
          final section = find.byType(ProfileTimelineSection);
          final browser = find.byType(ProfileTimelineBrowser);
          final panelRect = tester.getRect(section);
          var browserRect = tester.getRect(browser);
          expect(browserRect.left, equals(panelRect.left));
          expect(browserRect.right, equals(panelRect.right));
          final outer = tester.state<ScrollableState>(
            find.ancestor(of: section, matching: find.byType(Scrollable)).first,
          );
          final navbarRect = tester.getRect(find.byType(shad.AppBar).first);
          outer.position.jumpTo(
            (outer.position.pixels + browserRect.top - navbarRect.bottom - 8)
                .clamp(0.0, outer.position.maxScrollExtent),
          );
          await _pump(tester);
          browserRect = tester.getRect(browser);
          expect(browserRect.top, greaterThanOrEqualTo(navbarRect.bottom));
          await tester.tap(
            find.byKey(const ValueKey('shell-action-button-profile-day-trail')),
          );
          await _pump(tester);
          expect(tester.getRect(browser), browserRect);
          final day = DateTime.now();
          final dateId = DateTime(
            day.year,
            day.month,
            day.day,
          ).toIso8601String();
          final selected = tester.getRect(
            find.byKey(ValueKey('timeline-date-$dateId')),
          );
          final strip = tester.getRect(
            find.byKey(const ValueKey('timeline-date-slot')),
          );
          expect(selected.left, greaterThanOrEqualTo(strip.left));
          expect(selected.right, lessThanOrEqualTo(strip.right));
          expect(selected.bottom, lessThan(tester.view.physicalSize.height));
          final inner = find.descendant(
            of: browser,
            matching: find.byType(SingleChildScrollView),
          );
          await tester.drag(inner, const Offset(0, -220));
          await _pump(tester);
          expect(tester.takeException(), isNull);
          await verifyAndCapture('timeline');
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox());
          await tester.pump();
          var closed = false;
          final closing = CacheStore.instance.closeForTesting();
          unawaited(closing.then((_) => closed = true));
          // Real filesystem teardown may exceed frame-render deadlines.
          for (var i = 0; i < 200 && !closed; i++) {
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(milliseconds: 50)),
            );
            await tester.pump();
          }
          expect(closed, isTrue);
          await closing;
        }, () => client);
      },
    );
  }
  testWidgets('Overview omits activity panels without a signed-in user', (
    tester,
  ) async {
    await mount(tester);
    expect(find.byType(ProfileOverviewPage), findsOneWidget);
    expect(find.byType(SettingsPanel), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('Overview omits activity panels without a workspace', (
    tester,
  ) async {
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.authenticated(
        supa.User(
          id: 'owner',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '',
        ),
      ),
    );
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(),
    );
    await mount(tester);
    expect(find.byType(ProfileOverviewPage), findsOneWidget);
    expect(find.byType(SettingsPanel), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'Profile uses actual shell selector and navigates back at large text',
    (tester) async {
      await mount(tester);
      expect(find.byKey(const ValueKey('profile-views')), findsOneWidget);
      expect(find.byType(ProfileOverviewPage), findsOneWidget);
      await tester.tap(find.byTooltip('Activity timeline'));
      await _pump(tester);
      expect(find.text('Activity timeline'), findsOneWidget);
      await tester.tap(find.byTooltip('Overview'));
      await _pump(tester);
      expect(find.text('Overview'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(ProfileOverviewPage),
          matching: find.text('Overview'),
        ),
        findsNothing,
      );
      await tester.tap(find.text('Identity'));
      await _pump(tester);
      expect(
        router.routeInformationProvider.value.uri.path,
        Routes.profileEdit,
      );
      await tester.binding.handlePopRoute();
      await _pump(tester);
      expect(
        router.routeInformationProvider.value.uri.path,
        Routes.profileRoot,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('actual Profile account action selects stored account', (
    tester,
  ) async {
    await mount(tester);
    await tester.tap(find.byTooltip('Switch account'));
    await _pump(tester);
    expect(find.text('Account B'), findsOneWidget);
    await tester.tap(find.text('Account B'));
    await _pump(tester);
    verify(() => auth.syncCurrentSessionToStore()).called(1);
    verify(() => auth.switchAccount('b')).called(1);
    expect(tester.takeException(), isNull);
    await tester.pump(const Duration(seconds: 7));
  });
  for (final size in [const Size(320, 700), const Size(1032, 1376)]) {
    testWidgets('actual Profile selector fits $size at double text', (
      tester,
    ) async {
      await mount(tester, size: size);
      await tester.tap(find.byTooltip('Activity timeline'));
      await _pump(tester);
      expect(find.text('Activity timeline'), findsOneWidget);
      await tester.tap(find.byTooltip('Overview'));
      await _pump(tester);
      expect(find.text('Overview'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(ProfileOverviewPage),
          matching: find.text('Overview'),
        ),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
    });
  }
}
