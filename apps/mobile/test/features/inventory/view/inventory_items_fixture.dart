import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/inventory/view/inventory_products_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

class _Api extends Mock implements ApiClient {}

typedef ItemsCall = ({String? query, String status, int page});

/// In-memory products API: filters by status and name, pages by
/// `pageSize`, and lets a test hold or fail chosen requests.
class FakeItemsRepository extends InventoryRepository {
  FakeItemsRepository(this.catalog) : super(apiClient: _Api());

  final List<InventoryProduct> catalog;
  final calls = <ItemsCall>[];
  final productRequests = <String>[];

  /// Requests matching this wait for [release] before answering.
  bool Function(ItemsCall call)? holdWhen;
  final _held = Completer<void>();
  void release() => _held.complete();

  /// Requests matching this throw a server error.
  bool Function(ItemsCall call)? failWhen;

  @override
  Future<({List<InventoryProduct> data, int count})> getProducts(
    String wsId, {
    String? query,
    String status = 'active',
    int page = 1,
    int pageSize = 20,
    bool forceRefresh = false,
  }) async {
    final call = (query: query, status: status, page: page);
    calls.add(call);
    if (holdWhen?.call(call) ?? false) await _held.future;
    if (failWhen?.call(call) ?? false) {
      throw const ApiException(message: '', statusCode: 500);
    }
    final q = query?.trim().toLowerCase() ?? '';
    final rows = catalog
        .where((row) => status == 'all' || row.archived == (status != 'active'))
        .where((row) => (row.name ?? '').toLowerCase().contains(q))
        .toList();
    return (
      data: rows.skip((page - 1) * pageSize).take(pageSize).toList(),
      count: rows.length,
    );
  }

  @override
  Future<InventoryProduct?> getProduct(
    String wsId,
    String productId, {
    bool forceRefresh = false,
  }) async {
    productRequests.add(productId);
    return catalog.where((row) => row.id == productId).firstOrNull;
  }
}

InventoryStockEntry itemStock(
  String warehouse,
  String unit,
  double? amount, {
  double min = 2,
}) => InventoryStockEntry(
  unitId: 'unit-$unit',
  warehouseId: 'warehouse-$warehouse',
  amount: amount,
  minAmount: min,
  price: 12.5,
  unitName: unit,
  warehouseName: warehouse,
);

InventoryProduct item(
  String id,
  String name, {
  String? category,
  bool archived = false,
  List<InventoryStockEntry> stock = const [],
}) => InventoryProduct(
  id: id,
  name: name,
  category: category,
  categoryId: 'category',
  ownerId: 'owner',
  wsId: 'ws',
  archived: archived,
  inventory: stock,
);

const milkId = '0b6f1d2e-3c4a-4b5c-8d6e-7f8091a2b3c4';
const mugsId = '1c7e2f3a-4d5b-4c6d-9e7f-8091a2b3c4d5';
const missingId = '2d8f3a4b-5e6c-4d7e-af80-91a2b3c4d5e6';

String productLink(String id) =>
    'https://tuturuuu.com/ws/inventory/products/$id';

final List<InventoryProduct> itemsCatalog = [
  item(
    'beans',
    'House blend beans',
    category: 'Coffee',
    stock: [
      itemStock('Main store', 'Bag', 24),
      itemStock('Kiosk', 'Bag', 1),
      itemStock('Back room', 'Bag', 0),
      itemStock('Van', 'Bag', 6),
    ],
  ),
  item(
    milkId,
    'Oat milk',
    category: 'Dairy-free',
    stock: [itemStock('Main store', 'Carton', 3.5, min: 1)],
  ),
  item(
    'pass',
    'Tasting session',
    category: 'Experiences',
    stock: [itemStock('Kiosk', 'Seat', null)],
  ),
  item('cups', 'Paper cups'),
  item(mugsId, 'Festival mugs', archived: true),
];

const managerPermissions = {'view_inventory_stock', 'update_inventory'};

Future<({FakeItemsRepository inventory, ShellChromeActionsCubit shell})>
pumpItemsPage(
  WidgetTester tester, {
  Set<String> permissions = const {'view_inventory_stock'},
  List<InventoryProduct>? catalog,
  void Function(FakeItemsRepository inventory)? configure,
  InventoryScanCode? scanCode,
  InventoryOpenEditor? openEditor,
  Brightness brightness = Brightness.light,
  bool shadApp = false,
}) async {
  DesignRender.setSize(tester, DesignRender.sizes['phone']!);
  final auth = _Auth();
  final workspace = _Workspace();
  final permissionRepo = _Permissions();
  final shell = ShellChromeActionsCubit();
  final inventory = FakeItemsRepository(catalog ?? itemsCatalog);
  configure?.call(inventory);
  const user = AuthState.authenticated(
    User(
      id: 'actor',
      aud: 'authenticated',
      appMetadata: {},
      userMetadata: {},
      createdAt: '2026-01-01T00:00:00Z',
    ),
  );
  whenListen(auth, const Stream<AuthState>.empty(), initialState: user);
  const state = WorkspaceState(
    status: WorkspaceStatus.loaded,
    currentWorkspace: Workspace(id: 'ws', name: 'Booth'),
  );
  whenListen(
    workspace,
    const Stream<WorkspaceState>.empty(),
    initialState: state,
  );
  final grant = WorkspacePermissions(
    permissions: permissions,
    isCreator: false,
  );
  when(() => permissionRepo.peekPermissions(any())).thenReturn(grant);
  when(
    () => permissionRepo.readCachedPermissions(any()),
  ).thenAnswer((_) async => grant);
  when(
    () => permissionRepo.getPermissions(wsId: any(named: 'wsId')),
  ).thenAnswer((_) async => grant);
  addTearDown(() async {
    await auth.close();
    await workspace.close();
    await shell.close();
    inventory.dispose();
  });
  final page = MultiBlocProvider(
    providers: [
      BlocProvider<AuthCubit>.value(value: auth),
      BlocProvider<WorkspaceCubit>.value(value: workspace),
      BlocProvider<ShellChromeActionsCubit>.value(value: shell),
    ],
    child: InventoryProductsPage(
      inventoryRepository: inventory,
      permissionsRepository: permissionRepo,
      scanCode: scanCode,
      openEditor: openEditor,
    ),
  );
  // The create FAB is still a shadcn button, so manager cases use the shadcn
  // test app; read-only renders use the core/ui design render frame.
  if (shadApp) {
    await tester.pumpApp(page);
  } else {
    await tester.pumpWidget(
      DesignRenderApp(
        settings: const AppearanceSettings(),
        brightness: brightness,
        child: page,
      ),
    );
  }
  await tester.pumpAndSettle();
  return (inventory: inventory, shell: shell);
}

ShellActionSpec itemsAction(ShellChromeActionsCubit shell, String suffix) =>
    shell.state
        .resolveForLocation(Routes.inventoryProducts)
        .firstWhere((spec) => spec.id == '${Routes.inventoryProducts}-$suffix');

/// Toasts insert an overlay entry that needs a second frame to build.
Future<void> settleToast(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 5));
  await tester.pumpAndSettle();
}
