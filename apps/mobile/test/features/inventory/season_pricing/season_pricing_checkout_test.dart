import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/inventory/controllers/inventory_season_pricing_controller.dart';
import 'package:mobile/features/inventory/view/inventory_checkout_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';
import 'season_pricing_controller_test.dart' show period, quote;

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Inventory extends InventoryRepository {
  List<Map<String, dynamic>>? legacy;
  List<InventorySalesPeriod> periods = [period()];
  bool denied = false;
  @override
  Future<List<InventorySalesPeriod>> getCheckoutSalesPeriods(
    String wsId,
  ) async {
    if (denied) throw const ApiException(message: 'Denied', statusCode: 403);
    return periods;
  }

  @override
  Future<List<InventoryProduct>> getProductOptions(
    String wsId, {
    bool forceRefresh = false,
  }) async => const [
    InventoryProduct(
      id: 'product',
      name: 'Test product',
      categoryId: 'product-category',
      ownerId: 'owner',
      wsId: 'ws',
      financeCategoryId: 'category',
      inventory: [
        InventoryStockEntry(
          unitId: 'unit',
          warehouseId: 'warehouse',
          amount: 10,
          minAmount: 0,
          price: 999,
          unitName: 'Each',
          warehouseName: 'Main',
        ),
      ],
    ),
  ];
  @override
  Future<String> createSale({
    required String wsId,
    required String walletId,
    required List<Map<String, dynamic>> products,
    String? content,
    String? notes,
    String? categoryId,
    String? periodId,
  }) async {
    legacy = products;
    throw const ApiException(message: 'Synthetic rejection', statusCode: 409);
  }
}

class _Finance extends FinanceRepository {
  @override
  Future<List<Wallet>> getWallets(String wsId) async => const [
    Wallet(id: 'wallet', name: 'Wallet', currency: 'USD'),
  ];
  @override
  Future<List<TransactionCategory>> getCategories(String wsId) async => const [
    TransactionCategory(id: 'category', name: 'Sales', isExpense: false),
  ];
}

class _Settings extends SettingsRepository {
  @override
  Future<String?> getLastIncomeCategory(String wsId) async => null;
}

void main() {
  Future<void> mount(
    WidgetTester tester,
    _Inventory inventory,
    InventorySeasonPricingController controller, {
    InventorySaleDetail? sale,
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(768, 1600);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    const state = WorkspaceState(
      currentWorkspace: Workspace(id: 'ws', name: 'Workspace'),
    );
    final workspace = _Workspace();
    when(() => workspace.state).thenReturn(state);
    whenListen(
      workspace,
      const Stream<WorkspaceState>.empty(),
      initialState: state,
    );
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: workspace,
        child: InventoryCheckoutPage(
          sale: sale,
          inventoryRepository: inventory,
          financeRepository: _Finance(),
          settingsRepository: _Settings(),
          seasonController: controller,
          actorId: () => 'actor',
        ),
      ),
    );
    await tester.pumpAndSettle();
    addTearDown(controller.dispose);
  }

  Future<void> selectSeason(WidgetTester tester) async {
    await tester.tap(find.text('Cart'));
    await tester.pumpAndSettle();
    final dropdown = find.byType(DropdownButtonFormField<String>).at(1);
    await tester.ensureVisible(dropdown);
    await tester.tap(dropdown);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Season').last);
    await tester.pumpAndSettle();
  }

  testWidgets(
    'actual scheduled checkout uses quote price, currency/as-of and stable retry',
    (tester) async {
      final sent = <Map<String, dynamic>>[];
      final inventory = _Inventory();
      final controller = InventorySeasonPricingController(
        fetch: (_, _) async => quote(),
        send: (_, payload) async {
          sent.add(payload);
          throw const ApiException(message: 'Synthetic timeout', statusCode: 0);
        },
        isOnline: () async => true,
        now: () => DateTime.utc(2026, 10),
        requestId: () => 'request',
      );
      await mount(tester, inventory, controller);
      await tester.tap(find.byIcon(Icons.add_circle_outline_rounded).first);
      await selectSeason(tester);
      expect(
        find.textContaining('as of 2026-10-01 01:00:00'),
        findsOneWidget,
      );
      expect(find.textContaining('USD'), findsWidgets);
      expect(find.textContaining('USD 12.50'), findsWidgets);
      expect(find.textContaining(r'$999.00'), findsNothing);
      await tester.tap(find.text('Create sale'));
      await tester.pumpAndSettle();
      expect(sent, hasLength(1));
      expect(inventory.legacy, isNull);
      expect(
        (sent.single['products'] as List<dynamic>).single,
        containsPair('price_id', 'quote-1'),
      );
      expect(find.textContaining('Sale response uncertain.'), findsOneWidget);
      await tester.drag(find.text('Synthetic timeout'), const Offset(500, 0));
      await tester.pumpAndSettle();
      expect(find.text('Synthetic timeout'), findsNothing);
      await tester.tap(find.text('Create sale'));
      await tester.pumpAndSettle();
      expect(sent, hasLength(2));
      expect(sent[1], sent[0]);
      expect(
        tester.widget<PopScope>(find.byType(PopScope).last).canPop,
        isFalse,
      );
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.drainShadToastTimers();
    },
  );
  testWidgets('denied metadata blocks assignment; '
      'ordinary unassigned checkout stays usable', (tester) async {
    final inventory = _Inventory()..denied = true;
    var scheduledSends = 0;
    final controller = InventorySeasonPricingController(
      fetch: (_, _) async => quote(),
      send: (_, _) async {
        scheduledSends++;
        return 'unused';
      },
      isOnline: () async => true,
    );
    await mount(tester, inventory, controller);
    await tester.tap(find.byIcon(Icons.add_circle_outline_rounded).first);
    await tester.tap(find.text('Create sale'));
    await tester.pumpAndSettle();
    expect(inventory.legacy?.single['price'], 999);
    expect(scheduledSends, 0);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.drainShadToastTimers();
  });
  testWidgets('scheduled historical sale cannot submit a repriced invoice', (
    tester,
  ) async {
    final inventory = _Inventory();
    final controller = InventorySeasonPricingController(
      fetch: (_, _) async => quote(),
      send: (_, _) async => throw StateError('Must not write history'),
      isOnline: () async => true,
    );
    final sale = InventorySaleDetail(
      id: 'old-sale',
      paidAmount: 3,
      itemsCount: 1,
      totalQuantity: 1,
      owners: const [],
      source: 'finance_invoice',
      walletId: 'wallet',
      categoryId: 'category',
      period: period(),
      lines: const [
        InventorySaleLine(
          productId: 'product',
          productName: 'Test product',
          quantity: 1,
          price: 3,
          unitId: 'unit',
          warehouseId: 'warehouse',
        ),
      ],
    );
    await mount(tester, inventory, controller, sale: sale);
    final scaffold = tester.widget<FinanceFullscreenFormScaffold>(
      find.byType(FinanceFullscreenFormScaffold),
    );
    expect(scaffold.onPrimaryPressed, isNull);
    expect(
      find.textContaining('Recorded prices are preserved.'),
      findsOneWidget,
    );
    expect(find.textContaining('USD 3.00'), findsWidgets);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
