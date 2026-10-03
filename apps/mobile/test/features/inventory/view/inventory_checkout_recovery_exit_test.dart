import 'dart:async';
import 'dart:convert';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/inventory/inventory_checkout_defaults.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/sources/inventory_sale_journal.dart';
import 'package:mobile/features/inventory/controllers/inventory_season_pricing_controller.dart';
import 'package:mobile/features/inventory/view/inventory_checkout_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../season_pricing/sale_journal_fixture.dart';
import '../season_pricing/season_pricing_controller_test.dart'
    show lines, period, quote;

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Inventory extends InventoryRepository {
  @override
  Future<InventoryCheckoutDefaults> getCheckoutDefaults(String wsId) async =>
      const InventoryCheckoutDefaults();

  @override
  Future<List<InventoryProduct>> getProductOptions(
    String wsId, {
    bool forceRefresh = false,
  }) async => [];

  @override
  Future<List<InventorySalesPeriod>> getCheckoutSalesPeriods(
    String wsId,
  ) async => [period()];
}

class _Finance extends FinanceRepository {
  @override
  Future<List<Wallet>> getWallets(String wsId) async => [];

  @override
  Future<List<TransactionCategory>> getCategories(String wsId) async => [];
}

class _Settings extends SettingsRepository {
  @override
  Future<String?> getLastIncomeCategory(String wsId) async => null;
}

void main() {
  for (final state in ['confirmed', 'pending', 'unconfirmed']) {
    for (final exit in ['system back', 'dock back', 'normal navigation']) {
      testWidgets('$exit acknowledges only durable $state recovery', (
        tester,
      ) async {
        final store = MemorySaleStore();
        await store.journal.write(
          InventorySaleOperation(
            actor: 'actor',
            workspace: 'ws',
            requestId: 'request',
            body: jsonEncode({
              'inventory_request_id': 'request',
              'inventory_period_id': 'season',
              'content': 'Recovered sale',
              'wallet_id': 'wallet',
              'category_id': 'category',
              'products': [
                for (final line in lines)
                  {...line, 'price': 3, 'price_id': 'price'},
              ],
            }),
            currency: 'USD',
            periodName: 'Season',
            timeZone: 'Asia/Ho_Chi_Minh',
            asOf: DateTime.utc(2026, 10),
            createdAt: DateTime.utc(2026, 10),
            invoiceId: state == 'confirmed' ? 'invoice' : null,
          ),
        );
        var sends = 0;
        var lookups = 0;
        final controllers = <InventorySeasonPricingController>[];
        InventorySeasonPricingController makeController() {
          final controller = InventorySeasonPricingController(
            journal: store.journal,
            fetch: (_, _) async => quote(),
            send: (_, _) async {
              sends++;
              return 'unexpected';
            },
            lookupReceipt: (_, _) async {
              lookups++;
              return 'invoice';
            },
            isOnline: () async => true,
            now: () => DateTime.utc(2026, 10),
          );
          controllers.add(controller);
          return controller;
        }

        final workspace = _Workspace();
        const workspaceState = WorkspaceState(
          currentWorkspace: Workspace(id: 'ws', name: 'Workspace'),
        );
        when(() => workspace.state).thenReturn(workspaceState);
        whenListen(
          workspace,
          const Stream<WorkspaceState>.empty(),
          initialState: workspaceState,
        );
        final router = GoRouter(
          initialLocation: '/inventory',
          routes: [
            GoRoute(
              path: '/inventory',
              builder: (_, _) => const Text('Inventory home'),
              routes: [
                GoRoute(
                  path: 'checkout',
                  builder: (context, _) => shad.DrawerOverlay(
                    child: Column(
                      children: [
                        TextButton(
                          onPressed: () => context.go('/inventory'),
                          child: const Text('Shell dock back'),
                        ),
                        Expanded(
                          child: InventoryCheckoutPage(
                            embedded: true,
                            inventoryRepository: _Inventory(),
                            financeRepository: _Finance(),
                            settingsRepository: _Settings(),
                            seasonController: makeController(),
                            actorId: () => 'actor',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        );
        await tester.pumpWidget(
          BlocProvider<WorkspaceCubit>.value(
            value: workspace,
            child: shad.ShadcnApp.router(
              theme: const shad.ThemeData(
                colorScheme: shad.ColorSchemes.lightZinc,
              ),
              localizationsDelegates: const [
                ...AppLocalizations.localizationsDelegates,
                shad.ShadcnLocalizations.delegate,
              ],
              supportedLocales: AppLocalizations.supportedLocales,
              routerConfig: router,
              builder: ShadcnMaterialBridge.appBuilder,
            ),
          ),
        );
        unawaited(router.push<void>('/inventory/checkout'));
        await tester.pumpAndSettle();
        final original = controllers.single;
        if (state == 'unconfirmed') {
          store.failConfirmation = true;
          await original.retryPending();
          await tester.pumpAndSettle();
        }
        expect(
          original.completedInvoiceId,
          state == 'pending' ? isNull : 'invoice',
        );
        final beforeExit = store.values.values.single;
        if (exit == 'system back') {
          await tester.binding.handlePopRoute();
        } else if (exit == 'dock back') {
          await tester.tap(find.text('Shell dock back'));
        } else {
          router.go('/inventory');
        }
        await tester.pumpAndSettle();
        expect(find.byType(InventoryCheckoutPage), findsNothing);
        expect(find.text('Inventory home'), findsOneWidget);
        if (state == 'confirmed') {
          expect(await store.journal.read('actor', 'ws'), isNull);
        } else {
          expect(store.values.values.single, beforeExit);
        }
        unawaited(router.push<void>('/inventory/checkout'));
        await tester.pumpAndSettle();
        final restored = controllers.last;
        expect(restored.completedInvoiceId, isNull);
        expect(restored.hasPending, state != 'confirmed');
        expect(sends, 0);
        expect(lookups, state == 'unconfirmed' ? 1 : 0);
        await tester.pumpWidget(const SizedBox.shrink());
        router.dispose();
        for (final controller in controllers) {
          controller.dispose();
        }
        await workspace.close();
      });
    }
  }
}
