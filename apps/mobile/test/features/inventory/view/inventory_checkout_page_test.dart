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
import 'package:mobile/features/inventory/view/inventory_checkout_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _CheckoutInventoryRepository extends InventoryRepository {
  @override
  Future<List<InventoryProduct>> getProductOptions(String wsId) async => [];

  @override
  Future<List<InventorySalesPeriod>> getSalesPeriods(
    String wsId, {
    bool includeArchived = true,
  }) async => const [
    InventorySalesPeriod(
      id: 'period-1',
      name: 'TuCon 2026',
      status: 'active',
      saleCount: 0,
    ),
  ];
}

class _PartiallyFailingFinanceRepository extends FinanceRepository {
  @override
  Future<List<Wallet>> getWallets(String wsId) async {
    throw const ApiException(message: 'Wallets unavailable', statusCode: 503);
  }

  @override
  Future<List<TransactionCategory>> getCategories(String wsId) async => [];
}

class _CheckoutSettingsRepository extends SettingsRepository {
  @override
  Future<String?> getLastIncomeCategory(String wsId) async => null;
}

void main() {
  testWidgets('keeps fresh periods when another checkout option fails', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 1200);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    const workspace = Workspace(id: 'ws-1', name: 'Convention');
    const workspaceState = WorkspaceState(
      status: WorkspaceStatus.loaded,
      workspaces: [workspace],
      currentWorkspace: workspace,
      defaultWorkspace: workspace,
    );
    final workspaceCubit = _MockWorkspaceCubit();
    when(() => workspaceCubit.state).thenReturn(workspaceState);
    whenListen(
      workspaceCubit,
      const Stream<WorkspaceState>.empty(),
      initialState: workspaceState,
    );

    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: workspaceCubit,
        child: InventoryCheckoutPage(
          inventoryRepository: _CheckoutInventoryRepository(),
          financeRepository: _PartiallyFailingFinanceRepository(),
          settingsRepository: _CheckoutSettingsRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Some checkout choices could not be refreshed'),
      findsOneWidget,
    );

    await tester.tap(find.text('Cart'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('No period'));
    await tester.pumpAndSettle();

    expect(find.text('TuCon 2026'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
