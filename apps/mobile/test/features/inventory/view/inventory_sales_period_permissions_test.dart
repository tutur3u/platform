import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/inventory/view/inventory_sales_periods_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_read_warning.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Inventory extends Mock implements InventoryRepository {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

const _period = InventorySalesPeriod(
  id: 'period',
  name: 'Synthetic period',
  status: 'active',
  saleCount: 0,
);
const _denied = WorkspacePermissions(permissions: {}, isCreator: false);

Future<void> _mount(
  WidgetTester tester,
  InventoryRepository inventory,
  WorkspacePermissionsRepository permissions,
) async {
  final auth = _Auth();
  final workspace = _Workspace();
  when(() => auth.state).thenReturn(
    const AuthState.authenticated(
      User(
        id: 'actor',
        aud: 'authenticated',
        appMetadata: {},
        userMetadata: {},
        createdAt: '2026-01-01T00:00:00Z',
      ),
    ),
  );
  when(() => workspace.state).thenReturn(
    const WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: Workspace(id: 'ws', name: 'Synthetic'),
    ),
  );
  when(
    () => inventory.getSalesPeriods('ws'),
  ).thenAnswer((_) async => [_period]);
  addTearDown(auth.close);
  addTearDown(workspace.close);
  await tester.pumpApp(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<WorkspaceCubit>.value(value: workspace),
      ],
      child: InventorySalesPeriodsPage(
        inventoryRepository: inventory,
        permissionsRepository: permissions,
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 1));
  await tester.pump(const Duration(milliseconds: 1));
}

void _expectActions(WidgetTester tester, bool create, bool update) {
  expect(
    find.bySemanticsLabel('New period'),
    create ? findsOneWidget : findsNothing,
  );
  final tile = tester.widget<ListTile>(
    find.ancestor(
      of: find.text('Synthetic period'),
      matching: find.byType(ListTile),
    ),
  );
  expect(tile.onTap != null, update);
  expect(
    find.byTooltip('Archive period'),
    update ? findsOneWidget : findsNothing,
  );
}

void main() {
  for (final role in [
    (permissions: <String>{}, create: false, update: false),
    (permissions: {'create_inventory_sales'}, create: true, update: false),
    (permissions: {'update_invoices'}, create: false, update: true),
    (
      permissions: {'create_invoices', 'update_invoices'},
      create: true,
      update: true,
    ),
  ]) {
    testWidgets(
      'period actions match cached and fresh role ${role.permissions}',
      (tester) async {
        final inventory = _Inventory();
        final permissions = _Permissions();
        final online = Completer<WorkspacePermissions>();
        final grant = WorkspacePermissions(
          permissions: role.permissions,
          isCreator: false,
        );
        when(
          () => permissions.readCachedPermissions('ws'),
        ).thenAnswer((_) async => grant);
        when(
          () => permissions.getPermissions(wsId: 'ws'),
        ).thenAnswer((_) => online.future);
        await _mount(tester, inventory, permissions);
        _expectActions(tester, role.create, role.update);
        online.complete(grant);
        await tester.pump(const Duration(milliseconds: 1));
        _expectActions(tester, role.create, role.update);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets('fresh denial revokes actions and stale archive callback', (
    tester,
  ) async {
    final inventory = _Inventory();
    final permissions = _Permissions();
    final online = Completer<WorkspacePermissions>();
    const grant = WorkspacePermissions(
      permissions: {'create_inventory_sales', 'update_invoices'},
      isCreator: false,
    );
    when(
      () => permissions.readCachedPermissions('ws'),
    ).thenAnswer((_) async => grant);
    when(
      () => permissions.getPermissions(wsId: 'ws'),
    ).thenAnswer((_) => online.future);
    await _mount(tester, inventory, permissions);
    _expectActions(tester, true, true);
    final stale = tester
        .widget<IconButton>(
          find.byWidgetPredicate(
            (w) => w is IconButton && w.tooltip == 'Archive period',
          ),
        )
        .onPressed!;
    online.complete(_denied);
    await tester.pump(const Duration(milliseconds: 1));
    _expectActions(tester, false, false);
    stale();
    await tester.pump(const Duration(milliseconds: 1));
    expect(find.byType(InventoryReadWarning), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
