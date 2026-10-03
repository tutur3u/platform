import 'dart:async';
import 'dart:io';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/view/cache_storage_chart.dart';
import 'package:mobile/features/settings/view/cache_storage_sheet.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _Secure extends Mock implements FlutterSecureStorage {}

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

void main() {
  late Directory directory;
  late CacheStore store;
  late OfflinePreparationCoordinator coordinator;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('storage-review-');
    final secure = _Secure();
    final values = <String, String>{};
    when(
      () => secure.read(key: any(named: 'key')),
    ).thenAnswer((call) async => values[call.namedArguments[#key]]);
    when(
      () => secure.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      values[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    store = CacheStore.forTesting(
      secureStorage: secure,
      directoryResolver: () async => directory,
    );
    coordinator = OfflinePreparationCoordinator.forTesting(
      load: (_, _) async => {},
      write: (_, _, _) async {},
    );
    await store.write(
      key: const CacheKey(
        namespace: 'tasks.list',
        userId: 'actor',
        workspaceId: 'workspace',
      ),
      policy: CachePolicies.moduleData,
      payload: [
        {'id': 'synthetic'},
      ],
    );
  });

  tearDown(() async {
    coordinator.state.dispose();
    await store.closeForTesting();
    await Hive.close();
    directory.deleteSync(recursive: true);
  });

  Future<void> show(WidgetTester tester, String? workspaceId) async {
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: CacheStorageSheet(
            userId: 'actor',
            workspaceId: workspaceId,
            store: store,
            coordinator: coordinator,
          ),
        ),
      ),
    );
    await tester.runAsync(() async {
      await store.storageLimitSnapshot();
    });
    await tester.pumpAndSettle();
  }

  testWidgets('signed-in Storage opens without a selected workspace', (
    tester,
  ) async {
    final auth = _Auth();
    final workspace = _Workspace();
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.authenticated(
        supa.User(
          id: 'actor',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '2030',
        ),
      ),
    );
    whenListen(
      workspace,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(status: WorkspaceStatus.loaded),
    );
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => unawaited(
                  showCacheStorageSheet(
                    context,
                    store: store,
                    coordinator: coordinator,
                  ),
                ),
                child: const Text('Open Storage'),
              ),
            ),
          ),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
        ],
        child: MaterialApp.router(
          routerConfig: router,
          builder: (context, child) =>
              shad.Theme(data: MobileShadTheme.light, child: child!),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
        ),
      ),
    );
    await tester.tap(find.text('Open Storage'));
    await tester.pump();
    await tester.runAsync(() => store.storageLimitSnapshot());
    await tester.pumpAndSettle();
    expect(find.byType(CacheStorageSheet), findsOneWidget);
    expect(find.byType(CacheStorageChart), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('no workspace exposes limit only and cannot clear scoped data', (
    tester,
  ) async {
    await show(tester, null);
    expect(find.byType(CacheStorageChart), findsNothing);
    expect(find.textContaining('Select a workspace'), findsOneWidget);
    expect(
      tester.widget<ChoiceChip>(find.byType(ChoiceChip).first).onSelected,
      isNotNull,
    );
    expect(
      tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
      isNull,
    );
    expect(
      (await store.storageSnapshot(
        userId: 'actor',
        workspaceId: 'workspace',
      )).totalBytes,
      greaterThan(0),
    );
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'download starting after opening reactively disables and restores controls',
    (tester) async {
      final pending = Completer<void>();
      coordinator.register('tasks', (_) => pending.future);
      await tester.binding.setSurfaceSize(const Size(800, 1200));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await show(tester, 'workspace');
      expect(
        tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
        isNotNull,
      );
      final download = coordinator.run(
        userId: 'actor',
        workspaceId: 'workspace',
        productId: 'tasks',
      );
      await tester.pumpAndSettle();
      expect(coordinator.state.value.running, true);
      for (final chip in tester.widgetList<ChoiceChip>(
        find.byType(ChoiceChip),
      )) {
        expect(chip.onSelected, isNull);
      }
      expect(
        tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
        isNull,
      );
      pending.complete();
      await download;
      await tester.pumpAndSettle();
      expect(
        tester.widget<ChoiceChip>(find.byType(ChoiceChip).first).onSelected,
        isNotNull,
      );
      expect(
        tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
        isNotNull,
      );
      await tester.pumpWidget(const SizedBox());
    },
  );

  test('English count labels use singular and plural branches', () async {
    final en = await AppLocalizations.delegate.load(const Locale('en'));
    expect(
      en.offlineAvailableItems(1, 1),
      '1 unique indexed item across 1 stored snapshot',
    );
    expect(
      en.offlineAvailableItems(0, 2),
      '0 unique indexed items across 2 stored snapshots',
    );
    expect(
      en.offlineFreshness(1, 1),
      '1 stale snapshot · 1 expired snapshot retained for offline use',
    );
    expect(
      en.offlineFreshness(0, 2),
      '0 stale snapshots · 2 expired snapshots retained for offline use',
    );
    expect(en.offlinePendingCoverage(1), startsWith('1 queued change. It'));
    expect(en.offlinePendingCoverage(2), startsWith('2 queued changes. They'));
  });
}
