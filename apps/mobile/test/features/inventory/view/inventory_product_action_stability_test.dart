import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/inventory/view/inventory_products_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

class _Api extends Mock implements ApiClient {}

class _Finance extends FinanceRepository {
  _Finance() : super(apiClient: _Api());
  @override
  Future<String> getWorkspaceDefaultCurrency(
    String wsId, {
    bool forceRefresh = false,
  }) async => 'USD';
}

class _Inventory extends InventoryRepository {
  _Inventory() : super(apiClient: _Api());
  final requests = <Completer<({List<InventoryProduct> data, int count})>>[];
  @override
  Future<({List<InventoryProduct> data, int count})> getProducts(
    String wsId, {
    String? query,
    String status = 'active',
    int page = 1,
    int pageSize = 20,
    bool forceRefresh = false,
  }) {
    final request = Completer<({List<InventoryProduct> data, int count})>();
    requests.add(request);
    return request.future;
  }
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

void main() {
  testWidgets(
    'verified create action stays during data refresh, and old grants/results cannot cross accounts',
    (tester) async {
      final auth = _Auth();
      final workspace = _Workspace();
      final permissions = _Permissions();
      final inventory = _Inventory();
      final actors = StreamController<AuthState>.broadcast();
      final onlineGrant = Completer<WorkspacePermissions>();
      const grant = WorkspacePermissions(
        permissions: {'manage_inventory_catalog'},
        isCreator: false,
      );
      const denied = WorkspacePermissions(permissions: {}, isCreator: false);
      whenListen(auth, actors.stream, initialState: _actor('a'));
      when(() => workspace.state).thenReturn(
        const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: Workspace(id: 'ws', name: 'Synthetic'),
        ),
      );
      when(() => permissions.peekPermissions('ws')).thenReturn(grant);
      when(
        () => permissions.readCachedPermissions('ws'),
      ).thenAnswer((_) async => auth.state.user?.id == 'a' ? grant : denied);
      when(() => permissions.getPermissions(wsId: 'ws')).thenAnswer(
        (_) => auth.state.user?.id == 'a'
            ? onlineGrant.future
            : Future.value(denied),
      );
      addTearDown(() async {
        await actors.close();
        await auth.close();
        await workspace.close();
        inventory.dispose();
      });
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspace),
          ],
          child: InventoryProductsPage(
            inventoryRepository: inventory,
            financeRepository: _Finance(),
            permissionsRepository: permissions,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pump(const Duration(milliseconds: 1));
      expect(find.bySemanticsLabel('Create product'), findsOneWidget);
      expect(inventory.requests, hasLength(1));
      actors.add(_actor('b'));
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pump(const Duration(milliseconds: 1));
      expect(find.bySemanticsLabel('Create product'), findsNothing);
      inventory.requests.first.complete((
        data: [
          InventoryProduct.fromJson(const {
            'id': 'old',
            'ws_id': 'ws',
            'name': 'Old actor product',
          }),
        ],
        count: 1,
      ));
      onlineGrant.complete(grant);
      await tester.pump(const Duration(milliseconds: 1));
      expect(find.text('Old actor product'), findsNothing);
      expect(find.bySemanticsLabel('Create product'), findsNothing);
      inventory.requests.last.complete((
        data: const <InventoryProduct>[],
        count: 0,
      ));
      await tester.pump(const Duration(milliseconds: 1));
      expect(tester.takeException(), isNull);
    },
  );
}
