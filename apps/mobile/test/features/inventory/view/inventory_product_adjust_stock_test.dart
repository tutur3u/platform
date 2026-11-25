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

    for (final testCase in <({String name, double? server, bool online})>[
      (name: 'saves through the stock endpoint', server: null, online: true),
      (name: 'refuses when the server stock changed', server: 4, online: true),
      (name: 'needs a connection', server: null, online: false),
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
                serverAmount: testCase.server == null
                    ? null
                    : () => testCase.server,
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
        if (testCase.online && testCase.server == null) {
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
          expect(
            tester.widget<EditableText>(editorAmountField()).controller.text,
            '4.0',
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
  });
}
