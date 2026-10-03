import 'dart:io';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mobile/features/settings/view/offline_module_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Access extends MockCubit<InventoryAccessState>
    implements InventoryAccessCubit {}

class _Secure extends Mock implements FlutterSecureStorage {}

void main() {
  late Directory directory;
  late CacheStore store;
  late OfflinePreparationCoordinator coordinator;
  late _Auth auth;
  late _Workspace workspace;
  late _Access access;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('offline-module-widget-');
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
    )..register('inventory', (_) async {});
    await coordinator.setScope(
      userId: 'synthetic-actor',
      workspaceId: 'synthetic-workspace',
    );
    auth = _Auth();
    workspace = _Workspace();
    access = _Access();
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.authenticated(
        supa.User(
          id: 'synthetic-actor',
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
      initialState: const WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(
          id: 'synthetic-workspace',
          name: 'Synthetic workspace',
        ),
      ),
    );
    whenListen(
      access,
      const Stream<InventoryAccessState>.empty(),
      initialState: const InventoryAccessState(
        wsId: 'synthetic-workspace',
        status: InventoryAccessStatus.loaded,
        enabled: true,
      ),
    );
    for (final page in ['1', '2']) {
      await store.write(
        key: CacheKey(
          namespace: 'inventory.products',
          userId: 'synthetic-actor',
          workspaceId: 'synthetic-workspace',
          params: {'page': page},
        ),
        policy: CachePolicies.moduleData,
        payload: [
          {'id': 'synthetic-item'},
        ],
      );
    }
  });

  tearDown(() async {
    await auth.close();
    await workspace.close();
    await access.close();
    coordinator.state.dispose();
    await store.closeForTesting();
    await Hive.close();
    directory.deleteSync(recursive: true);
  });

  Future<void> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
          BlocProvider<InventoryAccessCubit>.value(value: access),
        ],
        child: MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: OfflineModulePage(
            moduleId: 'inventory',
            store: store,
            coordinator: coordinator,
          ),
        ),
      ),
    );
    // Hive setup futures were created outside the fake widget clock. Await a
    // real scoped read so their completion crosses into the widget lifecycle.
    await tester.runAsync(
      () => store.offlineInventory(
        userId: 'synthetic-actor',
        workspaceId: 'synthetic-workspace',
        moduleId: 'inventory',
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'ordinary cached data shows unique counts and honest unknown totals',
    (tester) async {
      await pump(tester);
      expect(find.text('inventory.products'), findsOneWidget);
      expect(
        find.text('1 unique indexed items across 2 stored snapshots'),
        findsOneWidget,
      );
      expect(
        find.textContaining(
          'Query totals are shown only when stored pages agree',
        ),
        findsOneWidget,
      );
      expect(
        find.textContaining('transferred network bytes are unknown'),
        findsOneWidget,
      );
      await tester.enterText(
        find.byKey(const ValueKey('offline-namespace-search')),
        'not-present',
      );
      await tester.pumpAndSettle();
      expect(find.text('inventory.products'), findsNothing);
      expect(find.text('No stored collections match.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'initial scope restoration does not notify ancestors during build',
    (tester) async {
      await coordinator.setScope();
      await pump(tester);
      expect(find.text('inventory.products'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('unavailable module redacts previously cached namespace counts', (
    tester,
  ) async {
    when(() => access.state).thenReturn(
      const InventoryAccessState(
        wsId: 'synthetic-workspace',
        status: InventoryAccessStatus.loaded,
      ),
    );
    await pump(tester);
    expect(find.text('inventory.products'), findsNothing);
    expect(
      find.byKey(const ValueKey('offline-namespace-search')),
      findsNothing,
    );
    expect(find.text('Remove stored module data'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
