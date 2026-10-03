import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/inventory/inventory_checkout_defaults.dart';
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

import '../../../helpers/helpers.dart';
import 'sale_journal_fixture.dart';
import 'season_pricing_controller_test.dart' show period, quote;

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Inventory extends InventoryRepository {
  _Inventory(this.actor);
  @override
  Future<InventoryCheckoutDefaults> getCheckoutDefaults(String wsId) async =>
      const InventoryCheckoutDefaults();
  final String Function() actor;
  final reads = <String>[];
  int periodReads = 0;
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
  }) async {
    reads.add('${actor()}/$wsId');
    return [
      InventoryProduct(
        id: 'product',
        name: '${actor()}/$wsId',
        categoryId: 'product-category',
        ownerId: 'owner',
        wsId: wsId,
        financeCategoryId: 'category',
        inventory: const [
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
  }

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

  @override
  Future<void> setLastIncomeCategory(String wsId, String categoryId) async {}
}

void main() {
  for (final response in ['timeout', 'success', 'receipt']) {
    for (final switchActor in [false, true]) {
      for (final returnToA in [false, true]) {
        testWidgets('$response ${switchActor ? 'actor' : 'workspace'} '
            '${returnToA ? 'A-B-A' : 'A-B'} reloads current mounted scope', (
          tester,
        ) async {
          tester.view
            ..devicePixelRatio = 1
            ..physicalSize = const Size(768, 1600);
          addTearDown(() {
            tester.view.resetPhysicalSize();
            tester.view.resetDevicePixelRatio();
          });
          var actor = 'actor';
          var ws = 'ws';
          final changes = StreamController<void>.broadcast();
          final workspaces = StreamController<WorkspaceState>();
          addTearDown(changes.close);
          addTearDown(workspaces.close);
          final workspace = _Workspace();
          whenListen(
            workspace,
            workspaces.stream,
            initialState: const WorkspaceState(
              currentWorkspace: Workspace(id: 'ws', name: 'Workspace'),
            ),
          );
          final inventory = _Inventory(() => actor);
          final store = MemorySaleStore();
          final post = Completer<String>();
          final receipt = Completer<String?>();
          final sent = <Map<String, dynamic>>[];
          final lookups = <String>[];
          final controller = InventorySeasonPricingController(
            journal: store.journal,
            currentActor: () => actor,
            lookupReceipt: (workspace, request) {
              lookups.add('$workspace/$request');
              return receipt.future;
            },
            fetch: (_, _) async => quote(),
            send: (_, payload) async {
              sent.add(payload);
              if (response == 'receipt') {
                throw const ApiException(message: 'Lost', statusCode: 0);
              }
              return await post.future;
            },
            isOnline: () async => true,
            now: () => DateTime.utc(2026, 10),
            requestId: () => 'original',
          );
          addTearDown(controller.dispose);
          await tester.pumpApp(
            BlocProvider<WorkspaceCubit>.value(
              value: workspace,
              child: InventoryCheckoutPage(
                inventoryRepository: inventory,
                financeRepository: _Finance(),
                settingsRepository: _Settings(),
                seasonController: controller,
                actorId: () => actor,
                actorChanges: changes.stream,
              ),
            ),
          );
          await tester.pumpAndSettle();
          await tester.tap(find.byIcon(Icons.add_circle_outline_rounded).first);
          await tester.tap(find.text('Cart'));
          await tester.pumpAndSettle();
          final dropdown = find.byType(DropdownButtonFormField<String>).at(1);
          await tester.ensureVisible(dropdown);
          await tester.tap(dropdown);
          await tester.pumpAndSettle();
          await tester.tap(find.text('Season').last);
          await tester.pumpAndSettle();
          await tester.tap(find.text('Create sale'));
          await tester.pump();
          expect(sent, hasLength(1));
          final original = await store.journal.read('actor', 'ws');
          expect(original, isNotNull);
          if (response == 'receipt') {
            await tester.pumpAndSettle();
            await tester.drag(find.text('Lost'), const Offset(500, 0));
            await tester.pumpAndSettle();
            await tester.drainShadToastTimers();
            await tester.tap(find.text('Check sale result'));
            await tester.pump();
            expect(lookups, ['ws/original']);
          }
          Future<void> transition({required bool back}) async {
            if (switchActor) {
              actor = back ? 'actor' : 'actor-b';
              changes.add(null);
            } else {
              ws = back ? 'ws' : 'ws-b';
              workspaces.add(
                WorkspaceState(
                  currentWorkspace: Workspace(id: ws, name: ws),
                ),
              );
            }
            await tester.pump();
            await tester.pump();
          }

          await transition(back: false);
          if (returnToA) await transition(back: true);
          if (response == 'receipt') {
            receipt.complete('invoice');
          } else if (response == 'success') {
            post.complete('invoice');
          } else {
            post.completeError(
              const ApiException(message: 'Delayed timeout', statusCode: 0),
            );
          }
          await tester.pumpAndSettle();
          final retained = await store.journal.read('actor', 'ws');
          expect(retained, isNotNull);
          expect(retained!.requestId, 'original');
          expect(retained.payload, original!.payload);
          expect(sent, hasLength(1));
          final form = tester.widget<FinanceFullscreenFormScaffold>(
            find.byType(FinanceFullscreenFormScaffold),
          );
          expect(form.isSaving, isFalse);
          if (returnToA) {
            expect(controller.operation!.actor, 'actor');
            expect(controller.operation!.workspace, 'ws');
            expect(controller.operation!.payload, original.payload);
            expect(find.text('Recover sale'), findsOneWidget);
            expect(
              form.onPrimaryPressed,
              response == 'success' ? isNull : isNotNull,
            );
          } else {
            expect(controller.operation, isNull);
            expect(inventory.reads, contains('$actor/$ws'));
            // The current catalog remains usable after the cart resets.
            await tester.tap(find.text('Browse'));
            await tester.pumpAndSettle();
            expect(find.text('$actor/$ws'), findsOneWidget);
            expect(find.text('Recover sale'), findsNothing);
          }
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.drainShadToastTimers();
        });
      }
    }
  }
}
