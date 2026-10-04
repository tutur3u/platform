import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/inventory/inventory_checkout_defaults.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/inventory/controllers/inventory_season_pricing_controller.dart';
import 'package:mobile/features/inventory/view/inventory_checkout_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_form_scaffold.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';
import 'sale_journal_fixture.dart';
import 'season_pricing_controller_test.dart' show period, quote;

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Inventory extends InventoryRepository {
  _Inventory({super.apiClient, super.cacheStore});
  InventoryCheckoutDefaults defaults = const InventoryCheckoutDefaults();
  @override
  Future<InventoryCheckoutDefaults> getCheckoutDefaults(String wsId) async =>
      defaults;
  int periodReads = 0;
  List<Map<String, dynamic>>? legacy;
  List<InventorySalesPeriod> periods = [period()];
  bool denied = false;
  @override
  Future<List<InventorySalesPeriod>> getCheckoutSalesPeriods(
    String wsId,
  ) async {
    periodReads++;
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
    Wallet(id: 'configured-wallet', name: 'Revenue wallet', currency: 'USD'),
  ];
  @override
  Future<List<TransactionCategory>> getCategories(String wsId) async => const [
    TransactionCategory(id: 'category', name: 'Sales', isExpense: false),
    TransactionCategory(
      id: 'configured-category',
      name: 'Configured sales',
      isExpense: false,
    ),
  ];
}

class _Settings extends SettingsRepository {
  _Settings({this.failLoad = false, this.failWrite = false});
  final bool failLoad;
  final bool failWrite;
  int writes = 0;
  @override
  Future<String?> getLastIncomeCategory(String wsId) async {
    if (failLoad) throw StateError('Preferences read unavailable');
    return null;
  }

  @override
  Future<void> setLastIncomeCategory(String wsId, String categoryId) async {
    writes++;
    if (failWrite) throw StateError('Preferences write unavailable');
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    for (final family in ['NotoSans', 'Geist', 'Roboto']) {
      await (FontLoader(
        family,
      )..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'))).load();
    }
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  });
  Future<void> mount(
    WidgetTester tester,
    _Inventory inventory,
    InventorySeasonPricingController controller, {
    InventorySaleDetail? sale,
    _Settings? settings,
    GlobalKey? captureKey,
    String? Function()? actorId,
    Stream<dynamic>? actorChanges,
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
        child: RepaintBoundary(
          key: captureKey,
          child: InventoryCheckoutPage(
            sale: sale,
            inventoryRepository: inventory,
            financeRepository: _Finance(),
            settingsRepository: settings ?? _Settings(),
            seasonController: controller,
            actorId: actorId ?? () => 'actor',
            actorChanges: actorChanges,
          ),
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
    'explicit cart reconciliation removes products excluded by period rules',
    (tester) async {
      final inventory = _Inventory()
        ..periods = [
          const InventorySalesPeriod(
            id: 'season',
            name: 'Season',
            status: 'active',
            saleCount: 0,
            productScope: 'allowlist',
          ),
        ];
      final controller = InventorySeasonPricingController(
        journal: MemorySaleStore().journal,
        fetch: (_, _) async => quote(),
        send: (_, _) async => 'invoice',
        isOnline: () async => true,
        now: () => DateTime.utc(2026, 10),
      );
      await mount(tester, inventory, controller);
      await tester.tap(find.byIcon(Icons.add_circle_outline_rounded).first);
      await selectSeason(tester);
      expect(
        find.textContaining('Some items do not match this period'),
        findsOneWidget,
      );
      final form = tester.widget<InventoryFormScaffold>(
        find.byType(InventoryFormScaffold),
      );
      expect(form.onPrimaryPressed, isNull);
      await tester.tap(find.text('Reconcile cart'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Removed 1 unavailable item. Review the cart before submitting.',
        ),
        findsOneWidget,
      );
      expect(
        find.text(
          'Add products from the browse tab to review and submit the sale.',
        ),
        findsOneWidget,
      );
      expect(inventory.legacy, isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.drainShadToastTimers();
    },
  );

  testWidgets('actual scheduled checkout uses quote price, currency/as-of and '
      'stable retry', (tester) async {
    final sent = <Map<String, dynamic>>[];
    final inventory = _Inventory()
      ..defaults = const InventoryCheckoutDefaults(
        salesPeriodId: 'season',
        revenueWalletId: 'configured-wallet',
        financeCategoryId: 'configured-category',
      );
    final controller = InventorySeasonPricingController(
      journal: MemorySaleStore().journal,
      lookupReceipt: (_, _) async => null,
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
    expect(controller.period?.id, 'season');
    await tester.tap(find.byIcon(Icons.add_circle_outline_rounded).first);
    await selectSeason(tester);
    expect(find.textContaining('as of 2026-10-01 01:00:00'), findsOneWidget);
    expect(find.textContaining('USD'), findsWidgets);
    expect(find.textContaining('USD 12.50'), findsWidgets);
    expect(find.textContaining(r'$999.00'), findsNothing);
    await tester.tap(find.text('Create sale'));
    await tester.pumpAndSettle();
    expect(sent, hasLength(1));
    expect(sent.single['wallet_id'], 'configured-wallet');
    expect(sent.single['category_id'], 'configured-category');
    expect(inventory.legacy, isNull);
    expect(
      (sent.single['products'] as List<dynamic>).single,
      containsPair('price_id', 'quote-1'),
    );
    expect(find.textContaining('Sale response uncertain.'), findsOneWidget);
    await tester.drag(find.text('Synthetic timeout'), const Offset(500, 0));
    await tester.pumpAndSettle();
    expect(find.text('Synthetic timeout'), findsNothing);
    await tester.drainShadToastTimers();
    await tester.tap(find.text('Check sale result'));
    await tester.pumpAndSettle();
    expect(sent, hasLength(2));
    expect(sent[1], sent[0]);
    expect(tester.widget<PopScope>(find.byType(PopScope).last).canPop, isTrue);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.drainShadToastTimers();
  });
  testWidgets('denied metadata blocks assignment; '
      'ordinary unassigned checkout stays usable', (tester) async {
    final inventory = _Inventory()..denied = true;
    var scheduledSends = 0;
    final controller = InventorySeasonPricingController(
      journal: MemorySaleStore().journal,
      lookupReceipt: (_, _) async => null,
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
      journal: MemorySaleStore().journal,
      lookupReceipt: (_, _) async => null,
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
    final scaffold = tester.widget<InventoryFormScaffold>(
      find.byType(InventoryFormScaffold),
    );
    expect(scaffold.onPrimaryPressed, isNull);
    expect(
      find.textContaining('Recorded prices are preserved.'),
      findsOneWidget,
    );
    expect(find.textContaining('USD 3.00'), findsWidgets);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'confirmed scheduled sale is terminal despite preferences write failure',
    (tester) async {
      final store = MemorySaleStore();
      var posts = 0;
      final settings = _Settings(failWrite: true);
      final inventory = _Inventory();
      final controller = InventorySeasonPricingController(
        journal: store.journal,
        lookupReceipt: (_, _) async => null,
        fetch: (_, _) async => quote(),
        send: (_, _) async {
          posts++;
          return 'invoice';
        },
        isOnline: () async => true,
        now: () => DateTime.utc(2026, 10),
      );
      await mount(tester, inventory, controller, settings: settings);
      await tester.tap(find.byIcon(Icons.add_circle_outline_rounded).first);
      await selectSeason(tester);
      await tester.tap(find.text('Create sale'));
      await tester.pumpAndSettle();
      expect(posts, 1);
      expect(settings.writes, 1);
      expect(controller.completedInvoiceId, 'invoice');
      final form = tester.widget<InventoryFormScaffold>(
        find.byType(InventoryFormScaffold),
      );
      expect(form.onPrimaryPressed, isNull);
      expect(find.text('Create sale'), findsNothing);
      await tester.pump(const Duration(seconds: 1));
      expect(posts, 1);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.drainShadToastTimers();
    },
  );

  testWidgets('uncertain checkout hides metadata Retry and retries frozen '
      'request after metadata fails', (tester) async {
    final inventory = _Inventory();
    final store = MemorySaleStore();
    final sent = <Map<String, dynamic>>[];
    final controller = InventorySeasonPricingController(
      journal: store.journal,
      lookupReceipt: (_, _) async => null,
      fetch: (_, _) async => quote(),
      send: (_, body) async {
        sent.add(body);
        throw const ApiException(message: 'Lost', statusCode: 0);
      },
      isOnline: () async => true,
      now: () => DateTime.utc(2026, 10),
      requestId: () => 'fixed',
    );
    await mount(
      tester,
      inventory,
      controller,
      settings: _Settings(failLoad: true),
    );
    expect(find.text('Retry'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.add_circle_outline_rounded).first);
    await selectSeason(tester);
    await tester.tap(find.text('Create sale'));
    await tester.pumpAndSettle();
    inventory.denied = true;
    final reads = inventory.periodReads;
    expect(find.text('Retry'), findsNothing);
    final form = tester.widget<InventoryFormScaffold>(
      find.byType(InventoryFormScaffold),
    );
    expect(form.onPrimaryPressed, isNotNull);
    expect(find.text('Test product · Each · Main'), findsOneWidget);
    expect(tester.widget<PopScope>(find.byType(PopScope).last).canPop, isTrue);
    await tester.drainShadToastTimers();
    if (find.text('Lost').evaluate().isNotEmpty) {
      await tester.drag(find.text('Lost').last, const Offset(500, 0));
      await tester.pumpAndSettle();
    }
    await tester.tap(find.text('Check sale result'));
    await tester.pumpAndSettle();
    expect(sent, hasLength(2));
    expect(sent[1], sent[0]);
    expect(inventory.periodReads, reads);
    expect(inventory.legacy, isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.drainShadToastTimers();
  });

  testWidgets('recreated mounted checkout recovers frozen operation without '
      'catalog metadata', (tester) async {
    final store = MemorySaleStore();
    var posts = 0;
    InventorySeasonPricingController create({bool recovered = false}) =>
        InventorySeasonPricingController(
          journal: store.journal,
          lookupReceipt: (_, _) async => recovered ? 'invoice' : null,
          fetch: (_, _) async => quote(),
          send: (_, _) async {
            posts++;
            throw const ApiException(message: 'Lost', statusCode: 0);
          },
          isOnline: () async => true,
          now: () => DateTime.utc(2026, 10),
          requestId: () => 'fixed',
        );
    await mount(tester, _Inventory(), create());
    await tester.tap(find.byIcon(Icons.add_circle_outline_rounded).first);
    await selectSeason(tester);
    await tester.tap(find.text('Create sale'));
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.drainShadToastTimers();
    final inventory = _Inventory()..denied = true;
    final restored = create(recovered: true);
    await mount(tester, inventory, restored);
    expect(find.text('Check sale result'), findsOneWidget);
    expect(restored.operation!.requestId, 'fixed');
    await tester.tap(find.text('Check sale result'));
    await tester.pumpAndSettle();
    expect(posts, 1);
    expect(restored.completedInvoiceId, 'invoice');
    expect(inventory.legacy, isNull);
    expect(
      tester
          .widget<InventoryFormScaffold>(find.byType(InventoryFormScaffold))
          .onPrimaryPressed,
      isNull,
    );
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.drainShadToastTimers();
  });

  testWidgets('mounted invoice success survives local cache failure without '
      'second create', (tester) async {
    final cache = _FailCache();
    when(
      () => cache.invalidateTags(any(), workspaceId: 'ws'),
    ).thenThrow(StateError('Cache unavailable'));
    final api = _InvoiceApi();
    final inventory = _Inventory(apiClient: api, cacheStore: cache);
    final controller = InventorySeasonPricingController(
      journal: MemorySaleStore().journal,
      lookupReceipt: (_, _) async => null,
      fetch: (_, _) async => quote(),
      send: inventory.sendScheduledSale,
      isOnline: () async => true,
      now: () => DateTime.utc(2026, 10),
    );
    await mount(tester, inventory, controller);
    await tester.tap(find.byIcon(Icons.add_circle_outline_rounded).first);
    await selectSeason(tester);
    await tester.tap(find.text('Create sale'));
    await tester.pumpAndSettle();
    expect(api.posts, 1);
    expect(controller.completedInvoiceId, 'invoice');
    expect(
      tester
          .widget<InventoryFormScaffold>(find.byType(InventoryFormScaffold))
          .onPrimaryPressed,
      isNull,
    );
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.drainShadToastTimers();
  });
  for (final width in [320.0, 768.0]) {
    testWidgets('full mounted recovery fits $width at large text', (
      tester,
    ) async {
      final controller = InventorySeasonPricingController(
        journal: MemorySaleStore().journal,
        lookupReceipt: (_, _) async => null,
        fetch: (_, _) async => quote(),
        send: (_, _) async =>
            throw const ApiException(message: 'Lost', statusCode: 0),
        isOnline: () async => true,
        now: () => DateTime.utc(2026, 10),
      );
      final key = GlobalKey();
      await mount(tester, _Inventory(), controller, captureKey: key);
      await tester.tap(find.byIcon(Icons.add_circle_outline_rounded).first);
      await selectSeason(tester);
      await tester.tap(find.text('Create sale'));
      await tester.pumpAndSettle();
      await tester.drainShadToastTimers();
      tester.view.physicalSize = Size(width, 900);
      tester.platformDispatcher.textScaleFactorTestValue = 1.5;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await tester.pumpAndSettle();
      expect(find.text('Recover sale'), findsOneWidget);
      expect(find.text('Test product · Each · Main'), findsOneWidget);
      expect(find.text('Check sale result'), findsOneWidget);
      expect(tester.takeException(), isNull);
      final directory = Platform.environment['INVENTORY_RECOVERY_VISUAL_DIR'];
      if (directory != null) {
        final boundary =
            key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
        await tester.runAsync(() async {
          final image = await boundary.toImage();
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          await File(
            '$directory/recovery-${width.toInt()}.png',
          ).writeAsBytes(bytes!.buffer.asUint8List());
          image.dispose();
        });
      }
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.drainShadToastTimers();
    });
  }
  testWidgets('legacy sale edit explains account scope lock without a period', (
    tester,
  ) async {
    final changes = StreamController<void>.broadcast();
    addTearDown(changes.close);
    var actor = 'actor';
    final controller = InventorySeasonPricingController(
      journal: MemorySaleStore().journal,
      fetch: (_, _) async => quote(),
      send: (_, _) async => 'unused',
      isOnline: () async => true,
    );
    const sale = InventorySaleDetail(
      id: 'legacy',
      paidAmount: 0,
      itemsCount: 0,
      totalQuantity: 0,
      owners: [],
      source: 'finance_invoice',
      lines: [],
    );
    await mount(
      tester,
      _Inventory(),
      controller,
      sale: sale,
      actorId: () => actor,
      actorChanges: changes.stream,
    );
    actor = 'other';
    changes.add(null);
    await tester.pumpAndSettle();
    expect(
      find.textContaining('The account or workspace changed.'),
      findsOneWidget,
    );
    expect(
      tester
          .widget<InventoryFormScaffold>(find.byType(InventoryFormScaffold))
          .onPrimaryPressed,
      isNull,
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'recovered sale remembers category without reopening on preference failure',
    (tester) async {
      var posts = 0;
      final settings = _Settings(failWrite: true);
      final controller = InventorySeasonPricingController(
        journal: MemorySaleStore().journal,
        lookupReceipt: (_, _) async => null,
        fetch: (_, _) async => quote(),
        send: (_, _) async {
          posts++;
          if (posts == 1) {
            throw const ApiException(message: 'Lost', statusCode: 0);
          }
          return 'invoice';
        },
        isOnline: () async => true,
        now: () => DateTime.utc(2026, 10),
      );
      await mount(tester, _Inventory(), controller, settings: settings);
      await tester.tap(find.byIcon(Icons.add_circle_outline_rounded).first);
      await selectSeason(tester);
      await tester.tap(find.text('Create sale'));
      await tester.pumpAndSettle();
      await tester.drainShadToastTimers();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Check sale result'));
      await tester.pumpAndSettle();
      expect(posts, 2);
      expect(settings.writes, 1);
      expect(controller.completedInvoiceId, 'invoice');
      expect(
        tester
            .widget<InventoryFormScaffold>(find.byType(InventoryFormScaffold))
            .onPrimaryPressed,
        isNull,
      );
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.drainShadToastTimers();
    },
  );
}

class _FailCache extends Mock implements CacheStore {}

class _InvoiceApi extends ApiClient {
  int posts = 0;
  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? payload, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    posts++;
    return {'invoice_id': 'invoice'};
  }
}
