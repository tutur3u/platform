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
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/inventory/view/inventory_product_editor_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/offline_inventory_harness.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockApiClient extends Mock implements ApiClient {}

class _MockCacheStore extends Mock implements CacheStore {}

class _FakeInventoryRepository extends InventoryRepository {
  _FakeInventoryRepository({
    super.apiClient,
    super.cacheStore,
    super.mutationQueue,
    super.cacheUserId,
  });
  @override
  Future<List<InventoryLookupItem>> getManufacturers(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    return const [InventoryLookupItem(id: 'manufacturer_1', name: 'Acme')];
  }

  @override
  Future<List<InventoryLookupItem>> getProductCategories(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    return const [
      InventoryLookupItem(id: 'category_1', name: 'Tea'),
      InventoryLookupItem(id: 'category_2', name: 'Coffee'),
    ];
  }

  @override
  Future<List<InventoryOwner>> getOwners(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    return const [
      InventoryOwner(id: 'owner_1', name: 'Alice'),
      InventoryOwner(id: 'owner_2', name: 'Bob'),
    ];
  }

  @override
  Future<List<InventoryLookupItem>> getProductUnits(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    return const [InventoryLookupItem(id: 'unit_1', name: 'Cup')];
  }

  @override
  Future<List<InventoryLookupItem>> getProductWarehouses(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    return const [InventoryLookupItem(id: 'warehouse_1', name: 'Front booth')];
  }
}

class _ExistingProductRepository extends _FakeInventoryRepository {
  _ExistingProductRepository({
    required super.apiClient,
    required this.amount,
    super.cacheStore,
    super.mutationQueue,
    super.cacheUserId,
  });
  final double? amount;

  @override
  Future<InventoryProduct?> getProduct(
    String wsId,
    String productId, {
    bool forceRefresh = false,
  }) async => InventoryProduct(
    id: productId,
    wsId: wsId,
    name: 'Synthetic product',
    categoryId: 'category_2',
    ownerId: 'owner_2',
    inventory: [
      InventoryStockEntry(
        unitId: 'unit_1',
        warehouseId: 'warehouse_1',
        amount: amount,
        minAmount: 2,
        price: 12.5,
      ),
    ],
  );
}

class _FakeFinanceRepository extends FinanceRepository {
  @override
  Future<List<TransactionCategory>> getCategories(String wsId) async {
    return const [
      TransactionCategory(id: 'finance_1', name: 'Booth sales'),
      TransactionCategory(id: 'finance_2', name: 'Special drinks'),
    ];
  }
}

class _FailingFinanceRepository extends FinanceRepository {
  @override
  Future<List<TransactionCategory>> getCategories(String wsId) async {
    throw const ApiException(message: 'Rate limited', statusCode: 429);
  }
}

Future<GlobalKey> _mountModal(WidgetTester tester, Widget editor) async {
  final key = GlobalKey();
  await tester.pumpApp(
    Builder(
      builder: (context) => TextButton(
        onPressed: () => showFinanceFullscreenModal<void>(
          context: context,
          builder: (context) => shad.Theme(
            data: MobileShadTheme.light,
            child: Theme(
              data: Theme.of(context).copyWith(
                textTheme: Theme.of(
                  context,
                ).textTheme.apply(fontFamily: 'NotoSans'),
              ),
              child: DefaultTextStyle.merge(
                style: const TextStyle(fontFamily: 'NotoSans'),
                child: RepaintBoundary(key: key, child: editor),
              ),
            ),
          ),
        ),
        child: const Text('Open synthetic editor'),
      ),
    ),
  );
  await tester.tap(find.text('Open synthetic editor'));
  await tester.pumpAndSettle();
  return key;
}

Future<void> _capture(WidgetTester tester, GlobalKey key, String name) async {
  final directory = Platform.environment['INVENTORY_VISUAL_DIR'];
  if (directory == null) return;
  final boundary =
      key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  await tester.runAsync(() async {
    final image = await boundary.toImage();
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final file = File('$directory/$name.png');
    await file.parent.create(recursive: true);
    await file.writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

Finder _amountField() => find.descendant(
  of: find.byKey(const ValueKey('inventory-stock-amount-0')),
  matching: find.byType(EditableText),
);

Future<void> _scrollToAmount(WidgetTester tester) async {
  await tester.scrollUntilVisible(
    find.byKey(const ValueKey('inventory-stock-amount-0')),
    350,
    maxScrolls: 10,
    scrollable: find
        .descendant(
          of: find.byType(InventoryProductEditorPage),
          matching: find.byType(Scrollable),
        )
        .first,
  );
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await (FontLoader(
      'NotoSans',
    )..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'))).load();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  });

  group('InventoryProductEditorPage', () {
    late _MockWorkspaceCubit workspaceCubit;
    late _FakeInventoryRepository inventoryRepository;
    late _FakeFinanceRepository financeRepository;
    late SettingsRepository settingsRepository;

    const workspace = Workspace(id: 'ws_1', name: 'Booth');
    const workspaceState = WorkspaceState(
      status: WorkspaceStatus.loaded,
      workspaces: [workspace],
      currentWorkspace: workspace,
      defaultWorkspace: workspace,
    );

    setUp(() {
      SharedPreferences.setMockInitialValues({
        'last-inventory-product-owner-ws_1': 'owner_2',
        'last-inventory-product-category-ws_1': 'category_2',
        'last-inventory-product-finance-category-ws_1': 'finance_2',
      });
      workspaceCubit = _MockWorkspaceCubit();
      when(() => workspaceCubit.state).thenReturn(workspaceState);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: workspaceState,
      );
      inventoryRepository = _FakeInventoryRepository();
      financeRepository = _FakeFinanceRepository();
      settingsRepository = SettingsRepository();
    });

    for (final testCase
        in <
          ({
            double? amount,
            bool clearQuantity,
            bool offline,
            bool verification,
          })
        >[
          (
            amount: null,
            clearQuantity: false,
            offline: false,
            verification: false,
          ),
          (
            amount: 0,
            clearQuantity: false,
            offline: false,
            verification: false,
          ),
          (
            amount: 7.5,
            clearQuantity: false,
            offline: false,
            verification: false,
          ),
          (
            amount: 7.5,
            clearQuantity: true,
            offline: false,
            verification: false,
          ),
          (
            amount: 7.5,
            clearQuantity: false,
            offline: true,
            verification: false,
          ),
          (
            amount: 9.5,
            clearQuantity: false,
            offline: false,
            verification: true,
          ),
        ]) {
      final amount = testCase.amount;
      final expectedAmount = testCase.clearQuantity ? null : amount;
      final payloadKind = testCase.offline ? 'offline queue' : 'PATCH';
      testWidgets(
        testCase.verification
            ? 'canceled verification closes editor '
                  'with one visible pending Save'
            : testCase.clearQuantity
            ? 'clearing finite quantity saves null and reloads as unlimited'
            : 'unrelated edit preserves stock amount $amount '
                  'in repository $payloadKind payload',
        (tester) async {
          tester.view
            ..devicePixelRatio = 1
            ..physicalSize = const Size(390, 1200);
          addTearDown(() {
            tester.view.resetPhysicalSize();
            tester.view.resetDevicePixelRatio();
          });
          final api = _MockApiClient();
          Map<String, dynamic>? payload;
          final cache = _MockCacheStore();
          final invalidations = <(String?, Set<String>)>[];
          when(
            () => cache.invalidateTags(
              any(),
              workspaceId: any(named: 'workspaceId'),
            ),
          ).thenAnswer((call) async {
            invalidations.add((
              call.namedArguments[#workspaceId] as String?,
              Set<String>.from(call.positionalArguments[0] as Iterable),
            ));
          });
          final harness = (await tester.runAsync(
            () =>
                OfflineInventoryHarness.create(api, online: !testCase.offline),
          ))!;
          final mutations = harness.queue;
          addTearDown(harness.dispose);
          when(() => api.patchJson(any(), any())).thenAnswer((call) async {
            payload = Map<String, dynamic>.from(
              call.positionalArguments[1] as Map,
            );
            if (testCase.verification) {
              throw const ApiException(
                message: 'Verification required',
                statusCode: 403,
                isVerificationRequired: true,
              );
            }
            return <String, dynamic>{};
          });
          await _mountModal(
            tester,
            BlocProvider<WorkspaceCubit>.value(
              value: workspaceCubit,
              child: InventoryProductEditorPage(
                productId: 'synthetic-product',
                inventoryRepository: _ExistingProductRepository(
                  apiClient: api,
                  cacheStore: cache,
                  mutationQueue: mutations,
                  cacheUserId: () => 'actor',
                  amount: amount,
                ),
                financeRepository: financeRepository,
                settingsRepository: settingsRepository,
              ),
            ),
          );
          await tester.pumpAndSettle();
          final name = find.byType(EditableText).first;
          await tester.ensureVisible(name);
          await tester.enterText(name, 'Renamed synthetic product');
          if (testCase.clearQuantity) {
            await _scrollToAmount(tester);
            await tester.enterText(_amountField(), '');
            await tester.pumpAndSettle();
          }
          await tester.runAsync(() async {
            final persisted = Completer<void>();
            void observedPending() {
              if (mutations.pending.value.isNotEmpty &&
                  !persisted.isCompleted) {
                persisted.complete();
              }
            }

            mutations.pending.addListener(observedPending);
            await tester.tap(find.text('Save product').hitTestable());
            await persisted.future.timeout(const Duration(seconds: 10));
            if (!testCase.verification) await mutations.synchronize();
            mutations.pending.removeListener(observedPending);
            if (testCase.offline) {
              payload = (await mutations.listPending()).single.payload;
            }
          });
          // Hive completes on real I/O; give those continuations time while
          // advancing frames until the save actually closes the editor.
          final saveDeadline = DateTime.now().add(const Duration(seconds: 10));
          while (find
                  .byType(InventoryProductEditorPage)
                  .evaluate()
                  .isNotEmpty &&
              DateTime.now().isBefore(saveDeadline)) {
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(milliseconds: 10)),
            );
            await tester.pump(const Duration(milliseconds: 16));
          }
          expect(find.byType(InventoryProductEditorPage), findsNothing);
          await tester.pumpAndSettle();
          expect(payload, isNotNull);
          expect(payload!['name'], 'Renamed synthetic product');
          if (testCase.offline) {
            verifyNever(() => api.patchJson(any(), any()));
          } else {
            verify(
              () => api.patchJson(
                '/api/v1/workspaces/ws_1/products/synthetic-product',
                payload!,
              ),
            ).called(1);
            final pending = await tester.runAsync(mutations.listPending);
            if (testCase.verification) {
              expect(pending, hasLength(1));
              expect(pending!.single.entityId, 'synthetic-product');
            } else {
              expect(pending, isEmpty);
            }
          }
          final savedStock = Map<String, dynamic>.from(
            (payload!['inventory'] as List).single as Map,
          );
          expect(savedStock['amount'], expectedAmount);
          expect(invalidations, hasLength(1));
          {
            expect(invalidations.single.$1, 'ws_1');
            expect(invalidations.single.$2, {
              'inventory:overview',
              'inventory:catalog',
              'inventory:audit',
            });
          }
          expect(
            await settingsRepository.getLastInventoryProductOwner('ws_1'),
            'owner_2',
          );
          expect(
            await settingsRepository.getLastInventoryProductCategory('ws_1'),
            'category_2',
          );
          expect(find.byType(InventoryProductEditorPage), findsNothing);
          await tester.drainShadToastTimers();
          if (testCase.verification) {
            final singleton = OfflineMutationQueue.instance;
            final originalPending = singleton.pending.value;
            singleton.pending.value = mutations.pending.value;
            await tester.pumpApp(
              const PendingSyncFrame(
                workspaceId: 'ws_1',
                entityId: 'synthetic-product',
                feature: 'inventory',
                child: Text('Locally saved product'),
              ),
            );
            await tester.pump();
            expect(find.text('Waiting to sync'), findsOneWidget);
            singleton.pending.value = originalPending;
          }
          final reloadKey = await _mountModal(
            tester,
            BlocProvider<WorkspaceCubit>.value(
              value: workspaceCubit,
              child: InventoryProductEditorPage(
                productId: 'synthetic-product',
                inventoryRepository: _ExistingProductRepository(
                  apiClient: api,
                  cacheStore: cache,
                  amount: savedStock['amount'] as double?,
                ),
                financeRepository: financeRepository,
                settingsRepository: settingsRepository,
              ),
            ),
          );
          await tester.pumpAndSettle();
          await _scrollToAmount(tester);
          final quantity = tester.widget<EditableText>(
            find.descendant(
              of: find.byKey(const ValueKey('inventory-stock-amount-0')),
              matching: find.byType(EditableText),
            ),
          );
          expect(quantity.controller.text, expectedAmount?.toString() ?? '');
          await _capture(
            tester,
            reloadKey,
            testCase.clearQuantity
                ? 'editor-finite-to-unlimited'
                : 'editor-reload-${amount ?? 'unlimited'}',
          );
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets(
      'invalid negative and nonfinite pasted quantities never PATCH',
      (tester) async {
        tester.view
          ..devicePixelRatio = 1
          ..physicalSize = const Size(390, 1200);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });
        final api = _MockApiClient();
        final cache = _MockCacheStore();
        await _mountModal(
          tester,
          BlocProvider<WorkspaceCubit>.value(
            value: workspaceCubit,
            child: InventoryProductEditorPage(
              productId: 'synthetic-product',
              inventoryRepository: _ExistingProductRepository(
                apiClient: api,
                cacheStore: cache,
                amount: 7.5,
              ),
              financeRepository: financeRepository,
              settingsRepository: settingsRepository,
            ),
          ),
        );
        await _scrollToAmount(tester);
        // The quantity field has no text formatter. These are feasible pasted
        // strings; pressing Save exercises the mounted form's own validator.
        for (final text in ['not-a-number', '-1', 'NaN', 'Infinity']) {
          await tester.enterText(_amountField(), text);
          await tester.pumpAndSettle();
          expect(
            tester.widget<EditableText>(_amountField()).controller.text,
            text,
          );
          await tester.tap(find.text('Save product').hitTestable());
          await tester.pumpAndSettle();
          expect(
            find.text('Enter a valid number.'),
            findsOneWidget,
            reason: text,
          );
          expect(find.byType(InventoryProductEditorPage), findsOneWidget);
          verifyNever(() => api.patchJson(any(), any()));
          verifyNever(
            () => cache.invalidateTags(
              any(),
              workspaceId: any(named: 'workspaceId'),
            ),
          );
          expect(tester.takeException(), isNull);
        }
      },
    );

    testWidgets('hydrates remembered selections for a faster create flow', (
      tester,
    ) async {
      await tester.pumpApp(
        BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: InventoryProductEditorPage(
            inventoryRepository: inventoryRepository,
            financeRepository: financeRepository,
            settingsRepository: settingsRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Bob'), findsWidgets);
      expect(find.text('Coffee'), findsWidgets);
      expect(find.text('Special drinks'), findsWidgets);
    });

    testWidgets('keeps the product form usable when an optional lookup fails', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(390, 1200);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpApp(
        BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: InventoryProductEditorPage(
            inventoryRepository: inventoryRepository,
            financeRepository: _FailingFinanceRepository(),
            settingsRepository: settingsRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Product name'), findsWidgets);
      expect(
        find.textContaining('Some product options could not be loaded'),
        findsOneWidget,
      );
      expect(find.text('Retry'), findsOneWidget);
      expect(find.textContaining('ApiException'), findsNothing);
    });
  });
}
