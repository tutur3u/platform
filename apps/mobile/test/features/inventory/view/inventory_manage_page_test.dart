import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/inventory/view/inventory_catalog_hub.dart';
import 'package:mobile/features/inventory/view/inventory_manage_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Inventory extends Mock implements InventoryRepository {}

class _Finance extends Mock implements FinanceRepository {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

class _DeleteApi extends Mock implements ApiClient {}

class _DeleteStore extends Mock implements CacheStore {}

class _DeletingInventory extends InventoryRepository {
  _DeletingInventory(this.reads, ApiClient api, OfflineMutationQueue queue)
    : super(apiClient: api, mutationQueue: queue);
  final InventoryRepository reads;
  @override
  Future<List<InventoryOwner>> getOwners(
    String id, {
    bool forceRefresh = false,
  }) => reads.getOwners(id, forceRefresh: forceRefresh);
  @override
  Future<List<InventoryLookupItem>> getManufacturers(
    String id, {
    bool forceRefresh = false,
  }) async => [];
  @override
  Future<List<InventoryLookupItem>> getProductCategories(
    String id, {
    bool forceRefresh = false,
  }) async => [];
  @override
  Future<List<InventoryLookupItem>> getProductUnits(
    String id, {
    bool forceRefresh = false,
  }) async => [];
  @override
  Future<List<InventoryLookupItem>> getProductWarehouses(
    String id, {
    bool forceRefresh = false,
  }) async => [];
}

AuthState _actor(String id) => AuthState.authenticated(
  User(
    id: id,
    aud: 'authenticated',
    appMetadata: const {},
    userMetadata: const {},
    createdAt: '2026-01-01T00:00:00Z',
  ),
);
WorkspaceState _workspace(String id) => WorkspaceState(
  status: WorkspaceStatus.loaded,
  currentWorkspace: Workspace(id: id, name: 'Synthetic $id'),
);

class _Harness {
  _Harness() {
    whenListen(
      workspace,
      workspaceStream.stream,
      initialState: _workspace('a'),
    );
    whenListen(auth, authStream.stream, initialState: _actor('actor-a'));
    when(
      () =>
          inventory.getOwners(any(), forceRefresh: any(named: 'forceRefresh')),
    ).thenAnswer((_) {
      final request = Completer<List<InventoryOwner>>();
      requests.add(request);
      return request.future;
    });
    when(
      () => inventory.getManufacturers(
        any(),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) async => []);
    when(
      () => inventory.getProductCategories(
        any(),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) async => []);
    when(
      () => inventory.getProductUnits(
        any(),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) async => []);
    when(
      () => inventory.getProductWarehouses(
        any(),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) async => []);
    when(() => finance.getCategories(any())).thenAnswer((_) async => []);
    when(() => permissions.getPermissions(wsId: any(named: 'wsId'))).thenAnswer(
      (_) {
        final grant = Completer<WorkspacePermissions>();
        grants.add(grant);
        return grant.future;
      },
    );
    when(() => inventory.createOwner(any(), any())).thenAnswer((_) async {});
  }

  final workspace = _Workspace();
  final auth = _Auth();
  final inventory = _Inventory();
  final finance = _Finance();
  final permissions = _Permissions();
  final workspaceStream = StreamController<WorkspaceState>.broadcast();
  final authStream = StreamController<AuthState>.broadcast();
  final requests = <Completer<List<InventoryOwner>>>[];
  final grants = <Completer<WorkspacePermissions>>[];

  Future<void> mount(WidgetTester tester, {InventoryRepository? writes}) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 1200);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<WorkspaceCubit>.value(value: workspace),
          BlocProvider<AuthCubit>.value(value: auth),
        ],
        child: InventoryManagePage(
          section: InventoryCatalogSection.owners,
          inventoryRepository: writes ?? inventory,
          financeRepository: finance,
          permissionsRepository: permissions,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 1));
  }

  void complete(int index, String label, {bool manage = true}) {
    requests[index].complete([InventoryOwner(id: label, name: label)]);
    grants[index].complete(
      WorkspacePermissions(
        permissions: manage ? const {'manage_inventory_setup'} : const {},
        isCreator: false,
      ),
    );
  }

  Future<void> close() async {
    await workspaceStream.close();
    await authStream.close();
    await workspace.close();
    await auth.close();
  }
}

void main() {
  for (final deleting in [false, true]) {
    testWidgets('setup rejection is safe server text, deleting=$deleting', (
      tester,
    ) async {
      final h = _Harness();
      addTearDown(h.close);
      const failure = ApiException(
        message: 'Synthetic name already exists',
        statusCode: 409,
      );
      when(() => h.inventory.createOwner(any(), any())).thenThrow(failure);
      InventoryRepository? writes;
      if (deleting) {
        final api = _DeleteApi();
        final queue = OfflineMutationQueue.forTesting(
          store: _DeleteStore(),
          userId: () => null,
          checkConnectivity: () async => [ConnectivityResult.wifi],
          connectivityChanges: const Stream.empty(),
        );
        writes = _DeletingInventory(h.inventory, api, queue);
      }
      await h.mount(tester, writes: writes);
      h.complete(0, 'Synthetic owner');
      await tester.pumpAndSettle();
      await tester.tap(
        deleting
            ? find.byTooltip('Delete')
            : find.bySemanticsLabel('Add owner'),
      );
      await tester.pumpAndSettle();
      if (!deleting) {
        await tester.enterText(find.byType(EditableText), 'Synthetic');
        await tester.tap(find.text('Add owner').last);
      } else {
        await tester.tap(find.text('Delete').last);
        await tester.pumpAndSettle();
      }
      await tester.pumpAndSettle();
      expect(
        find.text(deleting ? 'Authentication required' : failure.message),
        findsOneWidget,
      );
      expect(
        find.text(
          deleting
              ? 'ApiException(401): Authentication required'
              : 'ApiException(409): Synthetic name already exists',
        ),
        findsNothing,
      );
      await tester.drainShadToastTimers();
    });
  }

  testWidgets(
    'workspace transition clears old rows and add actions before B resolves',
    (tester) async {
      final h = _Harness();
      addTearDown(h.close);
      await h.mount(tester);
      h.complete(0, 'Owner A');
      await tester.pumpAndSettle();
      expect(find.text('Owner A'), findsOneWidget);
      expect(find.bySemanticsLabel('Add owner'), findsOneWidget);
      expect(find.byTooltip('Edit'), findsOneWidget);
      expect(find.byTooltip('Delete'), findsOneWidget);
      h.workspaceStream.add(_workspace('b'));
      await tester.pump();
      await tester.pump();
      expect(find.text('Owner A'), findsNothing);
      expect(find.bySemanticsLabel('Add owner'), findsNothing);
      h.complete(1, 'Owner B', manage: false);
      await tester.pumpAndSettle();
      expect(find.text('Owner B'), findsOneWidget);
      expect(find.bySemanticsLabel('Add owner'), findsNothing);
      expect(find.byTooltip('Edit'), findsNothing);
      expect(find.byTooltip('Delete'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('late A result cannot replace B and pending disposal is safe', (
    tester,
  ) async {
    final h = _Harness();
    addTearDown(h.close);
    await h.mount(tester);
    h.workspaceStream.add(_workspace('b'));
    await tester.pump();
    await tester.pump();
    h.complete(1, 'Owner B');
    await tester.pumpAndSettle();
    h.complete(0, 'Late A');
    await tester.pumpAndSettle();
    expect(find.text('Owner B'), findsOneWidget);
    expect(find.text('Late A'), findsNothing);
    h.workspaceStream.add(_workspace('c'));
    await tester.pump();
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    verifyNever(h.inventory.dispose);
    h.complete(2, 'Late C');
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('failed B permissions shows error without stale A controls', (
    tester,
  ) async {
    final h = _Harness();
    addTearDown(h.close);
    await h.mount(tester);
    h.complete(0, 'Owner A');
    await tester.pumpAndSettle();
    h.workspaceStream.add(_workspace('b'));
    await tester.pump();
    await tester.pump();
    h.requests[1].complete([]);
    h.grants[1].completeError(Exception('Synthetic permission error'));
    await tester.pumpAndSettle();
    expect(find.text('Owner A'), findsNothing);
    expect(find.bySemanticsLabel('Add owner'), findsNothing);
    expect(find.text('Retry'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'account transition within same workspace clears previous actor data',
    (tester) async {
      final h = _Harness();
      addTearDown(h.close);
      await h.mount(tester);
      h.complete(0, 'Actor A owner');
      await tester.pumpAndSettle();
      h.authStream.add(_actor('actor-b'));
      await tester.pump();
      await tester.pump();
      expect(find.text('Actor A owner'), findsNothing);
      expect(find.bySemanticsLabel('Add owner'), findsNothing);
      h.complete(1, 'Actor B owner', manage: false);
      await tester.pumpAndSettle();
      expect(find.text('Actor B owner'), findsOneWidget);
      expect(find.bySemanticsLabel('Add owner'), findsNothing);
      h.authStream.add(const AuthState.unauthenticated());
      await tester.pump();
      await tester.pump();
      expect(find.text('Actor B owner'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('open A sheet cannot submit into B and can be cancelled', (
    tester,
  ) async {
    final h = _Harness();
    addTearDown(h.close);
    await h.mount(tester);
    h.complete(0, 'Owner A');
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Add owner'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(EditableText), 'Synthetic new owner');
    h.workspaceStream.add(_workspace('b'));
    await tester.pump();
    await tester.pump();
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    verifyNever(() => h.inventory.createOwner(any(), any()));
    expect(find.text('Something went wrong'), findsOneWidget);
    expect(find.text('Exception: Something went wrong'), findsNothing);
    await tester.tap(find.text('Cancel').hitTestable());
    await tester.pump();
    h.complete(1, 'Owner B', manage: false);
    await tester.drainShadToastTimers();
    await tester.pumpAndSettle();
    expect(find.text('Owner A'), findsNothing);
    expect(find.text('Owner B'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('simultaneous scope notifications share one pending load', (
    tester,
  ) async {
    final h = _Harness();
    addTearDown(h.close);
    await h.mount(tester);
    h.complete(0, 'Owner A');
    await tester.pumpAndSettle();
    final refresh = tester
        .widget<NovaRefreshIndicator>(find.byType(NovaRefreshIndicator))
        .onRefresh;
    when(() => h.workspace.state).thenReturn(_workspace('b'));
    when(() => h.auth.state).thenReturn(_actor('actor-b'));
    h.workspaceStream.add(_workspace('b'));
    h.authStream.add(_actor('actor-b'));
    await tester.pump();
    await tester.pump();
    expect(h.requests, hasLength(2));
    expect(h.grants, hasLength(2));
    final refreshed = refresh();
    expect(h.requests, hasLength(3));
    h
      ..complete(1, 'Superseded B')
      ..complete(2, 'Owner B');
    await refreshed;
    await tester.pumpAndSettle();
    expect(find.text('Superseded B'), findsNothing);
    expect(find.text('Owner B'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('queued sheet success cannot refresh or toast a new scope', (
    tester,
  ) async {
    final h = _Harness();
    addTearDown(h.close);
    final save = Completer<void>();
    when(
      () => h.inventory.createOwner(any(), any()),
    ).thenAnswer((_) => save.future);
    await h.mount(tester);
    h.complete(0, 'Owner A');
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Add owner'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(EditableText), 'Synthetic new owner');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    verify(() => h.inventory.createOwner('a', 'Synthetic new owner')).called(1);
    save.complete();
    await tester.idle();
    // The pop has completed and queued its post-frame callback, but no frame
    // has run. Change selected scope before that callback is executed.
    when(() => h.workspace.state).thenReturn(_workspace('b'));
    h.workspaceStream.add(_workspace('b'));
    await tester.idle();
    await tester.pump();
    expect(h.requests, hasLength(2));
    h.complete(1, 'Owner B', manage: false);
    await tester.pumpAndSettle();
    expect(find.text('Owner B'), findsOneWidget);
    expect(find.bySemanticsLabel('Add owner'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
