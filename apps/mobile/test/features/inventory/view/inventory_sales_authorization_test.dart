import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/inventory/view/inventory_sales_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';
import '../../../helpers/offline_inventory_harness.dart';

typedef _Sales = ({
  List<InventorySaleSummary> data,
  int count,
  bool realtimeEnabled,
});

class _Api extends Mock implements ApiClient {}

class _Finance extends Mock implements FinanceRepository {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Inventory extends InventoryRepository {
  _Inventory(_Api api, OfflineInventoryHarness harness)
    : super(
        apiClient: api,
        cacheStore: harness.store,
        mutationQueue: harness.queue,
        cacheUserId: () => 'actor',
      );

  Completer<_Sales> response = Completer<_Sales>();

  @override
  Future<_Sales> getSales(
    String wsId, {
    int limit = 20,
    int offset = 0,
    String? periodId,
    bool forceRefresh = false,
  }) => response.future;

  @override
  Future<List<InventorySalesPeriod>> getSalesPeriods(
    String wsId, {
    bool includeArchived = true,
    bool forceRefresh = false,
  }) async => const [];
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late OfflineInventoryHarness harness;
  late _Inventory inventory;
  late _Finance finance;
  late _Permissions permissions;
  late _Auth auth;
  late _Workspace workspace;
  late Completer<WorkspacePermissions> freshPermissions;
  const grant = WorkspacePermissions(permissions: {}, isCreator: true);

  setUp(() async {
    final api = _Api();
    harness = await OfflineInventoryHarness.create(api, online: false);
    inventory = _Inventory(api, harness);
    finance = _Finance();
    permissions = _Permissions();
    auth = _Auth();
    workspace = _Workspace();
    freshPermissions = Completer<WorkspacePermissions>();
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.authenticated(
        User(
          id: 'actor',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '',
        ),
      ),
    );
    whenListen(
      workspace,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        currentWorkspace: Workspace(id: 'ws', name: 'Workspace'),
      ),
    );
    when(() => finance.peekWorkspaceDefaultCurrency('ws')).thenReturn('USD');
    when(
      () => finance.getWorkspaceDefaultCurrency('ws'),
    ).thenAnswer((_) async => 'USD');
    when(() => permissions.peekPermissions('ws')).thenReturn(grant);
    when(
      () => permissions.readCachedPermissions('ws'),
    ).thenAnswer((_) async => grant);
    when(
      () => permissions.getPermissions(wsId: 'ws'),
    ).thenAnswer((_) => freshPermissions.future);
    await harness.store.write(
      key: CacheKey(
        namespace: 'inventory.sales',
        userId: 'actor',
        workspaceId: 'ws',
        locale: currentCacheLocaleTag(),
        params: const {'limit': '24', 'offset': '0', 'periodId': ''},
      ),
      policy: CachePolicies.offlineCatalog,
      payload: {
        'data': [
          {'id': 'sale', 'notice': 'Saved sale', 'paid_amount': 10},
        ],
        'count': 1,
      },
    );
  });

  tearDown(() async {
    inventory.dispose();
    await auth.close();
    await workspace.close();
    await harness.dispose();
  });

  for (final status in [401, 403]) {
    testWidgets('denial $status clears snapshot and ignores late grants', (
      tester,
    ) async {
      inventory.response = Completer<_Sales>();
      freshPermissions = Completer<WorkspacePermissions>();
      tester.view.physicalSize = const Size(1000, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      expect(inventory.peekSales('ws', limit: 24)?.data.length, 1);
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspace),
          ],
          child: InventorySalesPage(
            inventoryRepository: inventory,
            financeRepository: finance,
            permissionsRepository: permissions,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pump();
      expect(find.text('Saved sale'), findsOneWidget);
      expect(find.byType(ExtendedFab), findsOneWidget);
      inventory.response.completeError(
        ApiException(statusCode: status, message: 'Access denied'),
      );
      await tester.pumpAndSettle();
      expect(find.text('Saved sale'), findsNothing);
      expect(find.byType(ExtendedFab), findsNothing);
      freshPermissions.complete(grant);
      await tester.pumpAndSettle();
      expect(find.byType(ExtendedFab), findsNothing);
    });
  }
}
