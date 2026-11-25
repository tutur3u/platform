// Shared harness for the product editor suites.
import 'dart:io';
import 'dart:ui' as ui;

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/inventory/view/inventory_product_editor_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';

class EditorAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

BlocProvider<AuthCubit> editorActorProvider() => BlocProvider<AuthCubit>(
  create: (_) {
    final auth = EditorAuthCubit();
    when(() => auth.state).thenReturn(
      const AuthState.authenticated(
        User(
          id: 'actor',
          aud: 'authenticated',
          appMetadata: {},
          userMetadata: {},
          createdAt: '2026-01-01T00:00:00Z',
        ),
      ),
    );
    return auth;
  },
);

class EditorWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class EditorApiClient extends Mock implements ApiClient {}

class EditorCacheStore extends Mock implements CacheStore {}

class EditorInventoryRepository extends InventoryRepository {
  EditorInventoryRepository({
    super.apiClient,
    super.cacheStore,
    super.mutationQueue,
    super.cacheUserId,
    super.networkAvailable,
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

class ExistingProductRepository extends EditorInventoryRepository {
  ExistingProductRepository({
    required super.apiClient,
    required this.amount,
    super.cacheStore,
    super.mutationQueue,
    super.cacheUserId,
    super.networkAvailable,
    this.serverAmount,
  });
  final double? amount;

  /// The amount a fresh (forced) read returns; defaults to [amount].
  final double? Function()? serverAmount;

  @override
  Future<InventoryProduct?> getProduct(
    String wsId,
    String productId, {
    bool forceRefresh = false,
  }) async => _product(
    wsId,
    productId,
    forceRefresh && serverAmount != null ? serverAmount!() : amount,
  );

  InventoryProduct _product(String wsId, String productId, double? amount) =>
      InventoryProduct(
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

class EditorFinanceRepository extends FinanceRepository {
  @override
  Future<List<TransactionCategory>> getCategories(String wsId) async {
    return const [
      TransactionCategory(id: 'finance_1', name: 'Booth sales'),
      TransactionCategory(id: 'finance_2', name: 'Special drinks'),
    ];
  }
}

class FailingFinanceRepository extends FinanceRepository {
  @override
  Future<List<TransactionCategory>> getCategories(String wsId) async {
    throw const ApiException(message: 'Rate limited', statusCode: 429);
  }
}

Future<GlobalKey> mountEditorModal(WidgetTester tester, Widget editor) async {
  final key = GlobalKey();
  await tester.pumpApp(
    Builder(
      builder: (context) => TextButton(
        onPressed: () => showFinanceFullscreenModal<void>(
          context: context,
          // pumpApp provides the app's component theme to the modal route.
          builder: (context) => Theme(
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
        child: const Text('Open synthetic editor'),
      ),
    ),
  );
  await tester.tap(find.text('Open synthetic editor'));
  await tester.pumpAndSettle();
  return key;
}

Future<void> captureEditor(
  WidgetTester tester,
  GlobalKey key,
  String name,
) async {
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

Finder editorAmountField() => find.descendant(
  of: find.byKey(const ValueKey('inventory-stock-amount-0')),
  matching: find.byType(EditableText),
);

Future<void> scrollToEditorAmount(WidgetTester tester) async {
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
