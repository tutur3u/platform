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

class _Inventory extends InventoryRepository {
  _Inventory(this.catalog) : super(apiClient: _Api());

  final List<InventoryProduct> catalog;
  final calls = <({String? query, String status})>[];
  final productRequests = <String>[];

  @override
  Future<({List<InventoryProduct> data, int count})> getProducts(
    String wsId, {
    String? query,
    String status = 'active',
    int page = 1,
    int pageSize = 20,
    bool forceRefresh = false,
  }) async {
    calls.add((query: query, status: status));
    final q = query?.trim().toLowerCase() ?? '';
    final rows = catalog
        .where((row) => status == 'all' || row.archived == (status != 'active'))
        .where((row) => (row.name ?? '').toLowerCase().contains(q))
        .toList();
    return (data: rows, count: rows.length);
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

InventoryStockEntry _stock(
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

InventoryProduct _item(
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

final List<InventoryProduct> _catalog = [
  _item(
    'beans',
    'House blend beans',
    category: 'Coffee',
    stock: [
      _stock('Main store', 'Bag', 24),
      _stock('Kiosk', 'Bag', 1),
      _stock('Back room', 'Bag', 0),
      _stock('Van', 'Bag', 6),
    ],
  ),
  _item(
    'milk',
    'Oat milk',
    category: 'Dairy-free',
    stock: [_stock('Main store', 'Carton', 3.5, min: 1)],
  ),
  _item(
    'pass',
    'Tasting session',
    category: 'Experiences',
    stock: [_stock('Kiosk', 'Seat', null)],
  ),
  _item('cups', 'Paper cups'),
  _item('mugs', 'Festival mugs', archived: true),
];

Future<({_Inventory inventory, ShellChromeActionsCubit shell})> _pump(
  WidgetTester tester, {
  Set<String> permissions = const {'view_inventory_stock'},
  InventoryScanCode? scanCode,
  Brightness brightness = Brightness.light,
  bool shadApp = false,
}) async {
  DesignRender.setSize(tester, DesignRender.sizes['phone']!);
  final auth = _Auth();
  final workspace = _Workspace();
  final permissionRepo = _Permissions();
  final shell = ShellChromeActionsCubit();
  final inventory = _Inventory(_catalog);
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

ShellActionSpec _action(ShellChromeActionsCubit shell, String suffix) => shell
    .state
    .resolveForLocation(Routes.inventoryProducts)
    .firstWhere((spec) => spec.id == '${Routes.inventoryProducts}-$suffix');

void main() {
  setUpAll(DesignRender.loadFonts);

  testWidgets('list leads with stock by location and drops count chips', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await _pump(tester);
    expect(find.text('House blend beans'), findsOneWidget);
    expect(find.text('Main store · Bag'), findsOneWidget);
    expect(find.text('24'), findsOneWidget);
    expect(find.text('1 more location'), findsOneWidget);
    expect(find.text('Van · Bag'), findsNothing);
    expect(find.text('3.5'), findsOneWidget);
    expect(find.text('Unlimited'), findsOneWidget);
    expect(find.text('No stock configured'), findsOneWidget);
    expect(find.text('Festival mugs'), findsNothing);
    expect(
      find.bySemanticsLabel(
        RegExp('Kiosk · Bag · 1 available · Low stock · Minimum amount: 2'),
      ),
      findsOneWidget,
    );
    expect(find.text('Products'), findsNothing);
    expect(find.text('Low stock in loaded products'), findsNothing);
    expect(find.byTooltip('Delete'), findsNothing);
    expect(tester.takeException(), isNull);
    await DesignRender.capture(tester, 'inventory-items-light');
    semantics.dispose();
  });

  testWidgets('dark render', (tester) async {
    await _pump(tester, brightness: Brightness.dark);
    expect(tester.takeException(), isNull);
    await DesignRender.capture(tester, 'inventory-items-dark');
  });

  testWidgets('catalog managers get the dock create action', (tester) async {
    final (inventory: _, :shell) = await _pump(
      tester,
      permissions: const {'view_inventory_stock', 'update_inventory'},
      shadApp: true,
    );
    // Under the router the page primary action moves into the shell dock.
    final create = shell.state
        .resolveForLocation('/test')
        .where((spec) => spec.id == 'page-primary-action')
        .single;
    expect(create.tooltip, 'Create product');
    expect(create.inDock, isTrue);
  });

  testWidgets('without view-stock the rows say stock is hidden', (
    tester,
  ) async {
    await _pump(tester, permissions: const {'view_inventory_catalog'});
    expect(find.text('Stock hidden'), findsNWidgets(4));
    expect(find.text('No stock configured'), findsNothing);
    expect(find.text('Create product'), findsNothing);
    expect(find.byTooltip('Create product'), findsNothing);
  });

  testWidgets('status pills query the server status', (tester) async {
    final (:inventory, shell: _) = await _pump(tester);
    await tester.tap(find.text('Archived'));
    await tester.pumpAndSettle();
    expect(inventory.calls.last.status, 'archived');
    expect(find.text('Festival mugs'), findsOneWidget);
    expect(find.text('Oat milk'), findsNothing);
    await tester.tap(find.text('All'));
    await tester.pumpAndSettle();
    expect(inventory.calls.last.status, 'all');
    expect(find.text('Festival mugs'), findsOneWidget);
    expect(find.text('Oat milk'), findsOneWidget);
  });

  testWidgets('a scanned code searches by name and can be cleared', (
    tester,
  ) async {
    final (:inventory, :shell) = await _pump(
      tester,
      scanCode: (_) async => 'oat',
    );
    _action(shell, 'scan').onPressed!();
    await tester.pumpAndSettle();
    expect(inventory.calls.last.query, 'oat');
    expect(find.text('Name matches for “oat”'), findsOneWidget);
    expect(find.text('Oat milk'), findsOneWidget);
    expect(find.text('House blend beans'), findsNothing);
    await tester.tap(find.text('Clear'));
    await tester.pumpAndSettle();
    expect(inventory.calls.last.query, '');
    expect(find.text('House blend beans'), findsOneWidget);
  });

  testWidgets('a product link resolves the item for a viewer', (tester) async {
    final (:inventory, :shell) = await _pump(
      tester,
      scanCode: (_) async => 'https://tuturuuu.com/ws/inventory/products/milk',
    );
    _action(shell, 'scan').onPressed!();
    await tester.pumpAndSettle();
    expect(inventory.productRequests, ['milk']);
    expect(inventory.calls.last.query, 'Oat milk');
    expect(find.text('House blend beans'), findsNothing);
  });

  testWidgets('foreign links are rejected without searching', (tester) async {
    final (:inventory, :shell) = await _pump(
      tester,
      scanCode: (_) async => 'https://example.com/promo',
    );
    final before = inventory.calls.length;
    _action(shell, 'scan').onPressed!();
    await tester.pump();
    await tester.pump();
    expect(
      find.text('This code is not a Tuturuuu product link.'),
      findsOneWidget,
    );
    expect(inventory.calls, hasLength(before));
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });

  testWidgets('scan action hides when no scanner exists on the host', (
    tester,
  ) async {
    final (inventory: _, :shell) = await _pump(tester);
    final ids = shell.state
        .resolveForLocation(Routes.inventoryProducts)
        .map((spec) => spec.id);
    expect(ids, isNot(contains('${Routes.inventoryProducts}-scan')));
    expect(ids, contains('${Routes.inventoryProducts}-search'));
  });

  testWidgets('managers long-press for edit and delete', (tester) async {
    await _pump(
      tester,
      permissions: const {'view_inventory_stock', 'update_inventory'},
      shadApp: true,
    );
    await tester.longPress(find.text('Oat milk'));
    await tester.pumpAndSettle();
    expect(find.text('Edit'), findsOneWidget);
    expect(find.text('Delete'), findsOneWidget);
  });

  testWidgets('viewers get no long-press actions', (tester) async {
    await _pump(tester);
    await tester.longPress(find.text('Oat milk'));
    await tester.pumpAndSettle();
    expect(find.text('Edit'), findsNothing);
  });
}
