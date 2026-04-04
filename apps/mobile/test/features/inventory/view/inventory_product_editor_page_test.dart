import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/inventory/view/inventory_product_editor_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _FakeInventoryRepository extends InventoryRepository {
  @override
  Future<List<InventoryLookupItem>> getProductCategories(String wsId) async {
    return const [
      InventoryLookupItem(id: 'category_1', name: 'Tea'),
      InventoryLookupItem(id: 'category_2', name: 'Coffee'),
    ];
  }

  @override
  Future<List<InventoryOwner>> getOwners(String wsId) async {
    return const [
      InventoryOwner(id: 'owner_1', name: 'Alice'),
      InventoryOwner(id: 'owner_2', name: 'Bob'),
    ];
  }

  @override
  Future<List<InventoryLookupItem>> getProductUnits(String wsId) async {
    return const [
      InventoryLookupItem(id: 'unit_1', name: 'Cup'),
    ];
  }

  @override
  Future<List<InventoryLookupItem>> getProductWarehouses(String wsId) async {
    return const [
      InventoryLookupItem(id: 'warehouse_1', name: 'Front booth'),
    ];
  }
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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('InventoryProductEditorPage', () {
    late _MockWorkspaceCubit workspaceCubit;
    late _FakeInventoryRepository inventoryRepository;
    late _FakeFinanceRepository financeRepository;
    late SettingsRepository settingsRepository;

    const workspace = Workspace(
      id: 'ws_1',
      name: 'Booth',
    );
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

    testWidgets(
      'hydrates remembered selections for a faster create flow',
      (
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
      },
    );
  });
}
