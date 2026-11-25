import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/inventory/view/inventory_product_editor_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/offline_inventory_harness.dart';

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

  group('InventoryProductEditorPage', () {
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

    for (final testCase
        in <({double? amount, bool offline, bool verification})>[
          (amount: null, offline: false, verification: false),
          (amount: 0, offline: false, verification: false),
          (amount: 7.5, offline: false, verification: false),
          (amount: 7.5, offline: true, verification: false),
          (amount: 9.5, offline: false, verification: true),
        ]) {
      final amount = testCase.amount;
      final payloadKind = testCase.offline ? 'offline queue' : 'PATCH';
      testWidgets(
        testCase.verification
            ? 'canceled verification closes editor '
                  'with one visible pending Save'
            : 'unrelated edit with stock $amount leaves stock out of the '
                  'repository $payloadKind payload',
        (tester) async {
          tester.view
            ..devicePixelRatio = 1
            ..physicalSize = const Size(390, 1200);
          addTearDown(() {
            tester.view.resetPhysicalSize();
            tester.view.resetDevicePixelRatio();
          });
          final api = EditorApiClient();
          Map<String, dynamic>? payload;
          final cache = EditorCacheStore();
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
          await mountEditorModal(
            tester,
            MultiBlocProvider(
              providers: [
                BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
                editorActorProvider(),
              ],
              child: InventoryProductEditorPage(
                productId: 'synthetic-product',
                inventoryRepository: ExistingProductRepository(
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
          // Edits never carry stock rows; the server keeps them as they are.
          expect(payload!.containsKey('inventory'), isFalse);
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
            try {
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
            } finally {
              singleton.pending.value = originalPending;
            }
          }
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
        final api = EditorApiClient();
        final cache = EditorCacheStore();
        await mountEditorModal(
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
              ),
              financeRepository: financeRepository,
              settingsRepository: settingsRepository,
            ),
          ),
        );
        await scrollToEditorAmount(tester);
        // The quantity field has no text formatter. These are feasible pasted
        // strings; pressing Save exercises the mounted form's own validator.
        for (final text in ['not-a-number', '-1', 'NaN', 'Infinity']) {
          await tester.enterText(editorAmountField(), text);
          await tester.pumpAndSettle();
          expect(
            tester.widget<EditableText>(editorAmountField()).controller.text,
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
        MultiBlocProvider(
          providers: [
            BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
            editorActorProvider(),
          ],
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
        MultiBlocProvider(
          providers: [
            BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
            editorActorProvider(),
          ],
          child: InventoryProductEditorPage(
            inventoryRepository: inventoryRepository,
            financeRepository: FailingFinanceRepository(),
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
