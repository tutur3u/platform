import 'dart:io';
import 'dart:ui' as ui;

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_pending_overlay.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/inventory/view/inventory_products_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_product_card.dart';
import 'package:mobile/features/inventory/widgets/inventory_sales_periods.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Inventory extends InventoryRepository {
  @override
  Future<({List<InventoryProduct> data, int count})> getProducts(
    String wsId, {
    String? query,
    String status = 'active',
    int page = 1,
    int pageSize = 20,
    bool forceRefresh = false,
  }) async => (
    data: query == 'missing' ? <InventoryProduct>[] : [_product()],
    count: query == 'missing' ? 0 : 1,
  );
}

class _Finance extends Mock implements FinanceRepository {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

InventoryProduct _product({double? amount, int rows = 1}) => InventoryProduct(
  id: 'synthetic-product',
  name: 'Festival coffee',
  manufacturer: 'Synthetic owner',
  owner: const InventoryOwner(id: 'owner', name: 'Synthetic owner'),
  category: 'Coffee',
  categoryId: 'category',
  ownerId: 'owner',
  wsId: 'synthetic-workspace',
  inventory: [
    for (var index = 0; index < rows; index++)
      InventoryStockEntry(
        unitId: 'unit-$index',
        warehouseId: 'warehouse-$index',
        amount: amount,
        minAmount: 5,
        price: 12.5,
        unitName: index == 0 ? 'Cup' : 'Bag',
        warehouseName: 'Booth ${index + 1}',
      ),
  ],
);

void _viewport(WidgetTester tester, Size size) {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

Widget _scaled(Widget child, double scale, GlobalKey key) => Builder(
  builder: (context) => MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
    child: shad.Theme(
      data: MobileShadTheme.light,
      child: DefaultTextStyle.merge(
        style: const TextStyle(fontFamily: 'NotoSans'),
        child: Theme(
          data: Theme.of(context).copyWith(
            textTheme: Theme.of(
              context,
            ).textTheme.apply(fontFamily: 'NotoSans'),
          ),
          child: RepaintBoundary(key: key, child: child),
        ),
      ),
    ),
  ),
);

Future<void> _capture(WidgetTester tester, GlobalKey key, String name) async {
  final directory = Platform.environment['INVENTORY_VISUAL_DIR'];
  if (directory == null) return;
  final boundary =
      key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  await tester.runAsync(() async {
    final image = await boundary.toImage();
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(directory).create(recursive: true);
    await File(
      '$directory/$name.png',
    ).writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final loader = FontLoader('NotoSans')
      ..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'));
    await loader.load();
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });
  test('null quantities are unlimited and never low stock', () {
    expect(inventoryProductHasLowStock(_product()), isFalse);
    expect(inventoryProductHasLowStock(_product(amount: 0)), isTrue);
    expect(inventoryProductHasLowStock(_product(amount: -1)), isTrue);
    expect(inventoryProductHasLowStock(_product(amount: 5)), isTrue);
    expect(inventoryProductHasLowStock(_product(amount: 6)), isFalse);
  });

  testWidgets('low-stock marker and semantics identify the affected unit row', (
    tester,
  ) async {
    _viewport(tester, const Size(390, 844));
    final semantics = tester.ensureSemantics();
    try {
      final key = GlobalKey();
      final product = _product();
      await tester.pumpApp(
        _scaled(
          shad.Scaffold(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                InventoryProductCard(
                  product: InventoryProduct(
                    id: product.id,
                    name: product.name,
                    categoryId: product.categoryId,
                    ownerId: product.ownerId,
                    wsId: product.wsId,
                    inventory: const [
                      InventoryStockEntry(
                        unitId: 'cup',
                        warehouseId: 'one',
                        amount: 12,
                        minAmount: 5,
                        price: 12.5,
                        unitName: 'Cup',
                        warehouseName: 'Booth 1',
                      ),
                      InventoryStockEntry(
                        unitId: 'bag',
                        warehouseId: 'two',
                        amount: 1,
                        minAmount: 5,
                        price: 12.5,
                        unitName: 'Bag',
                        warehouseName: 'Booth 2',
                      ),
                      InventoryStockEntry(
                        unitId: 'session',
                        warehouseId: 'three',
                        amount: null,
                        minAmount: 5,
                        price: 12.5,
                        unitName: 'Session',
                        warehouseName: 'Booth 3',
                      ),
                    ],
                  ),
                  currency: 'USD',
                ),
              ],
            ),
          ),
          1,
          key,
        ),
      );
      await tester.pump();
      expect(find.byIcon(Icons.warning_amber_rounded), findsOneWidget);
      expect(find.text('Low stock • Minimum amount: 5'), findsOneWidget);
      expect(
        find.bySemanticsLabel(
          RegExp('Booth 2 • Bag • 1 available.*Low stock • Minimum amount: 5'),
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp('Booth 3 • Session • Unlimited available'),
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      await _capture(tester, key, 'compact-stock-warnings');
    } finally {
      semantics.dispose();
    }
  });

  testWidgets(
    'actual pending overlay retains names and renders unknown identifiers',
    (tester) async {
      _viewport(tester, const Size(390, 844));
      final product = _product(amount: 8);
      final overlaid = overlayPendingProducts(
        product.wsId,
        [product],
        [
          PendingMutationRecord(
            id: 'synthetic-pending-edit',
            feature: 'inventory',
            method: 'PATCH',
            path:
                '/api/v1/workspaces/${product.wsId}/inventory/'
                'products/${product.id}',
            workspaceId: product.wsId,
            optimisticPatch: {'entityId': product.id},
            createdAt: DateTime.utc(2026, 10),
            payload: {
              'name': 'Pending beans',
              'inventory': [
                {
                  'unit_id': 'unit-0',
                  'warehouse_id': 'warehouse-0',
                  'amount': 1.5,
                  'min_amount': 2.5,
                  'price': 12.5,
                },
                {
                  'unit_id': 'new-unit',
                  'warehouse_id': 'new-warehouse',
                  'amount': null,
                  'min_amount': 0,
                  'price': 12.5,
                },
              ],
            },
          ),
        ],
      ).single;
      expect(overlaid.inventory.first.unitName, 'Cup');
      expect(overlaid.inventory.first.warehouseName, 'Booth 1');
      expect(overlaid.inventory.first.amount, 1.5);
      expect(overlaid.inventory.last.amount, isNull);
      final key = GlobalKey();
      final semantics = tester.ensureSemantics();
      try {
        await tester.pumpApp(
          _scaled(
            shad.Scaffold(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  InventoryProductCard(product: overlaid, currency: 'USD'),
                ],
              ),
            ),
            1,
            key,
          ),
        );
        await tester.pump();
        expect(find.text('Booth 1 • Cup'), findsOneWidget);
        expect(
          find.text('Warehouse new-warehouse • Unit new-unit'),
          findsOneWidget,
        );
        expect(find.text('Low stock • Minimum amount: 2.5'), findsOneWidget);
        expect(
          find.bySemanticsLabel(
            RegExp('Booth 1 • Cup • 1.5 available.*Minimum amount: 2.5'),
          ),
          findsOneWidget,
        );
        expect(
          find.bySemanticsLabel(
            RegExp(
              'Warehouse new-warehouse • Unit new-unit • Unlimited available',
            ),
          ),
          findsOneWidget,
        );
        await _capture(tester, key, 'compact-pending-stock-context');
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    },
  );

  for (final size in [const Size(320, 900), const Size(768, 1024)]) {
    testWidgets('populated card and periods fit $size at large text', (
      tester,
    ) async {
      _viewport(tester, size);
      final key = GlobalKey();
      var created = 0;
      await tester.pumpApp(
        _scaled(
          shad.Scaffold(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                InventoryProductCard(
                  product: _product(rows: 4),
                  currency: 'USD',
                ),
                const SizedBox(height: 12),
                InventorySalesPeriodBar(
                  workspaceId: 'synthetic-workspace',
                  periods: const [
                    InventorySalesPeriod(
                      id: 'season',
                      name: 'Summer coffee festival',
                      status: 'active',
                      saleCount: 12,
                    ),
                  ],
                  selectedPeriodId: 'season',
                  canManage: true,
                  onChanged: (_) {},
                  onCreate: () => created++,
                  onEdit: (_) {},
                  onToggleArchive: (_) {},
                ),
              ],
            ),
          ),
          2,
          key,
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(find.text('Synthetic owner • Coffee'), findsOneWidget);
      expect(find.textContaining('Unlimited available'), findsNWidgets(4));
      expect(find.text('Low stock'), findsNothing);
      expect(find.text('Booth 4 • Bag'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('New period').hitTestable(),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('New period').hitTestable());
      expect(created, 1);
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.byType(InventorySalesPeriodBar));
      await _capture(
        tester,
        key,
        'compact-periods-large-text-${size.width.toInt()}',
      );
    });
  }

  testWidgets(
    'compact overview has a visible primary workflow and calm empty state',
    (tester) async {
      _viewport(tester, const Size(390, 844));
      final key = GlobalKey();
      await tester.pumpApp(
        _scaled(
          shad.Scaffold(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                InventoryHeroCard(
                  title: 'Overview',
                  icon: Icons.inventory_2_outlined,
                  showHeader: false,
                  metrics: const [
                    InventoryMetricTile(
                      label: 'Income',
                      value: 'USD 1,200.00',
                      icon: Icons.south_west,
                    ),
                    InventoryMetricTile(
                      label: 'Expense',
                      value: 'USD 300.00',
                      icon: Icons.north_east,
                    ),
                    InventoryMetricTile(
                      label: 'Sales',
                      value: 'USD 900.00',
                      icon: Icons.receipt_outlined,
                    ),
                  ],
                  actions: [
                    InventoryActionTile(
                      label: 'Sell',
                      icon: Icons.point_of_sale,
                      primary: true,
                      onPressed: () {},
                    ),
                    InventoryActionTile(
                      label: 'Create product',
                      icon: Icons.add_box_outlined,
                      onPressed: () {},
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                const InventoryEmptyPanel(
                  body: 'No low-stock products right now.',
                ),
                const SizedBox(height: 16),
                InventoryProductCard(
                  product: _product(amount: 8),
                  currency: 'USD',
                ),
              ],
            ),
          ),
          1,
          key,
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(
        tester.getSize(find.byType(InventoryHeroCard)).height,
        lessThan(844 / 3),
      );
      for (final tile in find.byType(InventoryActionTile).evaluate()) {
        expect(
          tester.getSize(find.byWidget(tile.widget)).height,
          greaterThanOrEqualTo(48),
        );
      }
      await _capture(tester, key, 'compact-overview-populated');
    },
  );

  testWidgets(
    'actual Products page mounts synthetic data and searches without writes',
    (tester) async {
      _viewport(tester, const Size(390, 844));
      final workspace = _Workspace();
      final inventory = _Inventory();
      final finance = _Finance();
      final permissions = _Permissions();
      final auth = _Auth();
      final shell = ShellChromeActionsCubit();
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
      when(() => permissions.peekPermissions(any())).thenReturn(null);
      when(() => permissions.readCachedPermissions(any())).thenAnswer(
        (_) async =>
            const WorkspacePermissions(permissions: {}, isCreator: false),
      );
      addTearDown(() async {
        await auth.close();
        await shell.close();
      });
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(
          id: 'synthetic-workspace',
          name: 'Synthetic',
        ),
      );
      when(() => workspace.state).thenReturn(state);
      whenListen(
        workspace,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );
      when(() => finance.peekWorkspaceDefaultCurrency(any())).thenReturn('USD');
      when(
        () => finance.getWorkspaceDefaultCurrency(any()),
      ).thenAnswer((_) async => 'USD');
      when(
        () => permissions.getPermissions(wsId: any(named: 'wsId')),
      ).thenAnswer(
        (_) async =>
            const WorkspacePermissions(permissions: {}, isCreator: false),
      );
      final key = GlobalKey();
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<WorkspaceCubit>.value(value: workspace),
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<ShellChromeActionsCubit>.value(value: shell),
          ],
          child: _scaled(
            InventoryProductsPage(
              inventoryRepository: inventory,
              financeRepository: finance,
              permissionsRepository: permissions,
            ),
            1,
            key,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Festival coffee'), findsOneWidget);
      expect(find.textContaining('Unlimited available'), findsOneWidget);
      expect(find.text('Create product'), findsNothing);
      expect(tester.takeException(), isNull);
      await _capture(tester, key, 'compact-products-mounted');
      shell.state
          .resolveForLocation(Routes.inventoryProducts)
          .first
          .onPressed!();
      await tester.pump();
      final search = shell.state
          .resolveForLocation(Routes.inventoryProducts)
          .first;
      search.searchController!.text = 'missing';
      search.onSearchChanged!('missing');
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pumpAndSettle();
      expect(find.text('Festival coffee'), findsNothing);
      search.onCloseSearch!();
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pumpAndSettle();
      expect(find.text('Festival coffee'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await workspace.close();
    },
  );
}
