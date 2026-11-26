import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/inventory/view/inventory_product_editor_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';

import 'inventory_editor_fixture.dart';

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

  group('Inventory stock editing', () {
    late EditorWorkspaceCubit workspaceCubit;
    late EditorInventoryRepository inventoryRepository;
    late EditorFinanceRepository financeRepository;
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
      workspaceCubit = EditorWorkspaceCubit();
      when(() => workspaceCubit.state).thenReturn(workspaceState);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: workspaceState,
      );
      inventoryRepository = EditorInventoryRepository();
      financeRepository = EditorFinanceRepository();
      settingsRepository = SettingsRepository();
    });

    /// A consignment row: partner P takes 30% (3000 basis points).
    Map<String, dynamic> storedRow({double? amount = 7.5, int bps = 3000}) => {
      'unit_id': 'unit_1',
      'warehouse_id': 'warehouse_1',
      'amount': amount,
      'min_amount': 2,
      'price': 12.5,
      'revenue_share_partner_id': 'partner-p',
      'revenue_share_bps': bps,
    };

    for (final testCase
        in <
          ({String name, Map<String, dynamic> server, bool online, bool saves})
        >[
          (
            name: 'saves through the stock endpoint and keeps revenue share',
            server: storedRow(),
            online: true,
            saves: true,
          ),
          (
            name: 'refuses when the server amount changed',
            server: storedRow(amount: 4),
            online: true,
            saves: false,
          ),
          (
            name: 'refuses when the server revenue share changed',
            server: storedRow(bps: 1000),
            online: true,
            saves: false,
          ),
          (
            name: 'needs a connection',
            server: storedRow(),
            online: false,
            saves: false,
          ),
        ]) {
      testWidgets('Adjust stock ${testCase.name}', (tester) async {
        tester.view
          ..devicePixelRatio = 1
          ..physicalSize = const Size(390, 1200);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });
        final api = EditorApiClient();
        final cache = EditorCacheStore();
        when(
          () => cache.invalidateTags(
            any(),
            workspaceId: any(named: 'workspaceId'),
          ),
        ).thenAnswer((_) async {});
        when(
          () => api.patchJson(any(), any()),
        ).thenAnswer((_) async => <String, dynamic>{});
        // The form loads the stored rows, then the save re-reads them.
        var stockReads = 0;
        when(
          () => api.getJson(
            '/api/v1/workspaces/ws_1/products/synthetic-product/inventory',
          ),
        ).thenAnswer(
          (_) async => {
            'data': [if (stockReads++ == 0) storedRow() else testCase.server],
          },
        );
        final key = await mountEditorModal(
          tester,
          MultiBlocProvider(
            providers: [
              BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
              editorActorProvider(),
            ],
            child: InventoryProductEditorPage(
              productId: 'synthetic-product',
              stockFirst: true,
              canAdjustStock: true,
              inventoryRepository: ExistingProductRepository(
                apiClient: api,
                cacheStore: cache,
                amount: 7.5,
                networkAvailable: () async => testCase.online,
              ),
              financeRepository: financeRepository,
              settingsRepository: settingsRepository,
            ),
          ),
        );
        // Adjust stock shows the stock rows alone.
        expect(
          find.byKey(const ValueKey('inventory-product-name')),
          findsNothing,
        );
        await scrollToEditorAmount(tester);
        await tester.enterText(editorAmountField(), '');
        await tester.pumpAndSettle();
        await tester.tap(find.text('Save product').hitTestable());
        await tester.pumpAndSettle();
        if (testCase.saves) {
          final call = verify(
            () => api.patchJson(
              '/api/v1/workspaces/ws_1/products/synthetic-product/inventory',
              captureAny(),
            ),
          )..called(1);
          final body = call.captured.single as Map<String, dynamic>;
          expect(body.keys, ['inventory']);
          final row = (body['inventory'] as List).single as Map;
          // An empty quantity is unlimited stock, never zero.
          expect(row['amount'], isNull);
          expect(row['price'], 12.5);
          // The endpoint resets omitted revenue share; the stored values go
          // back unchanged.
          expect(row['revenue_share_partner_id'], 'partner-p');
          expect(row['revenue_share_bps'], 3000);
          expect(find.byType(InventoryProductEditorPage), findsNothing);
          await tester.drainShadToastTimers();
          return;
        }
        verifyNever(() => api.patchJson(any(), any()));
        expect(find.byType(InventoryProductEditorPage), findsOneWidget);
        if (!testCase.online) {
          expect(
            find.textContaining('Adjusting stock needs a connection'),
            findsOneWidget,
          );
          // The edit stays in the form to save again.
          expect(
            tester.widget<EditableText>(editorAmountField()).controller.text,
            '',
          );
        } else {
          expect(
            find.textContaining('Stock changed since you opened this'),
            findsOneWidget,
          );
          // The form now shows the server's rows.
          expect(
            tester.widget<EditableText>(editorAmountField()).controller.text,
            '${testCase.server['amount']}',
          );
        }
        await captureEditor(tester, key, 'editor-adjust-${testCase.name}');
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('editing hides stock and creating needs adjust access', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(390, 1200);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      for (final (productId, canAdjust, stockShown) in [
        ('synthetic-product', true, false),
        (null, false, false),
        (null, true, true),
      ]) {
        await tester.pumpApp(
          MultiBlocProvider(
            providers: [
              BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
              editorActorProvider(),
            ],
            child: InventoryProductEditorPage(
              key: ValueKey((productId, canAdjust)),
              productId: productId,
              canAdjustStock: canAdjust,
              inventoryRepository: productId == null
                  ? inventoryRepository
                  : ExistingProductRepository(
                      apiClient: EditorApiClient(),
                      amount: 3,
                    ),
              financeRepository: financeRepository,
              settingsRepository: settingsRepository,
            ),
          ),
        );
        await tester.pumpAndSettle();
        // The stock section sits last in a lazy list.
        await tester.drag(
          find
              .descendant(
                of: find.byType(InventoryProductEditorPage),
                matching: find.byType(Scrollable),
              )
              .first,
          const Offset(0, -4000),
        );
        await tester.pumpAndSettle();
        expect(
          find.text('Add stock row'),
          stockShown ? findsOneWidget : findsNothing,
          reason: '$productId $canAdjust',
        );
      }
    });
    Future<EditorApiClient> pumpAdjust(
      WidgetTester tester, {
      required Future<Map<String, dynamic>> Function() stockRows,
      bool settle = true,
    }) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(390, 1200);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final api = EditorApiClient();
      final cache = EditorCacheStore();
      when(
        () =>
            cache.invalidateTags(any(), workspaceId: any(named: 'workspaceId')),
      ).thenAnswer((_) async {});
      when(
        () => api.getJson(
          '/api/v1/workspaces/ws_1/products/synthetic-product/inventory',
        ),
      ).thenAnswer((_) => stockRows());
      when(
        () => api.patchJson(any(), any()),
      ).thenAnswer((_) async => <String, dynamic>{});
      await mountEditorModal(
        settle: settle,
        tester,
        MultiBlocProvider(
          providers: [
            BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
            editorActorProvider(),
          ],
          child: InventoryProductEditorPage(
            productId: 'synthetic-product',
            stockFirst: true,
            canAdjustStock: true,
            inventoryRepository: ExistingProductRepository(
              apiClient: api,
              cacheStore: cache,
              amount: 7.5,
              networkAvailable: () async => true,
            ),
            financeRepository: financeRepository,
            settingsRepository: settingsRepository,
          ),
        ),
      );
      return api;
    }

    testWidgets('Adjust stock saves only after the stored rows load', (
      tester,
    ) async {
      final rows = Completer<Map<String, dynamic>>();
      final api = await pumpAdjust(
        tester,
        stockRows: () => rows.future,
        settle: false,
      );
      await tester.tap(find.text('Save product'), warnIfMissed: false);
      await tester.pump(const Duration(milliseconds: 500));
      verifyNever(() => api.patchJson(any(), any()));
      rows.complete({
        'data': [storedRow()],
      });
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save product').hitTestable());
      await tester.pumpAndSettle();
      verify(
        () => api.patchJson(
          '/api/v1/workspaces/ws_1/products/synthetic-product/inventory',
          any(),
        ),
      ).called(1);
      await tester.drainShadToastTimers();
    });

    testWidgets('a consignment row keeps its warehouse and unit', (
      tester,
    ) async {
      await pumpAdjust(
        tester,
        stockRows: () async => {
          'data': [storedRow()],
        },
      );
      await tester.pumpAndSettle();
      // The unit card shows the row's unit; a picker would list it again.
      expect(find.text('Cup'), findsOneWidget);
      await tester.tap(find.text('Cup'));
      await tester.pumpAndSettle();
      expect(find.text('Cup'), findsOneWidget);
      await tester.tap(find.text('Front booth'));
      await tester.pumpAndSettle();
      expect(find.text('Front booth'), findsOneWidget);
    });

    testWidgets('creating asks for whole stock numbers', (tester) async {
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
            BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
            editorActorProvider(),
          ],
          child: InventoryProductEditorPage(
            canAdjustStock: true,
            inventoryRepository: inventoryRepository,
            financeRepository: financeRepository,
            settingsRepository: settingsRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await scrollToEditorAmount(tester);
      await tester.enterText(editorAmountField(), '2.5');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Create product').last.hitTestable());
      await tester.pumpAndSettle();
      expect(find.text('Enter a whole number'), findsOneWidget);
    });
  });
}
