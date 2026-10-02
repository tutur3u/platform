import 'dart:io';
import 'dart:ui' as ui;
import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/inventory/inventory_stock_health.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/inventory/view/inventory_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_product_card.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart' show User;
import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _FractionalOverview extends InventoryRepository {
  _FractionalOverview({this.amount = 2.5, this.minimum = 2.5});

  final double amount;
  final double minimum;
  @override
  Future<InventoryStockHealth> getStockHealth(String wsId) async =>
      InventoryStockHealth.fromJson({
        'generatedAt': '2026-10-01T00:00:00Z',
        'summary': <String, dynamic>{
          'activeProducts': 1,
          'stockedProducts': 1,
          'lowStockRows': 1,
          'outOfStockRows': 0,
          'unlimitedStockRows': 0,
        },
      });

  bool disposed = false;

  @override
  void dispose() {
    disposed = true;
    super.dispose();
  }

  @override
  Future<InventoryOverview> getOverview(
    String wsId, {
    bool forceRefresh = false,
  }) async => InventoryOverview(
    realtimeEnabled: false,
    totals: const InventoryOverviewTotals(
      walletsCount: 0,
      totalIncome: 0,
      totalExpense: 0,
      inventorySalesRevenue: 0,
      inventorySalesCount: 0,
    ),
    lowStockProducts: [
      InventoryLowStockProduct(
        productId: 'synthetic-fractional',
        productName: 'Fractional beans',
        amount: amount,
        minAmount: minimum,
        price: 7.5,
        warehouseName: 'Synthetic booth',
        unitName: 'Bag',
      ),
    ],
    recentSales: const [],
    ownerBreakdown: const [],
    categoryBreakdown: const [],
  );
}

InventoryProduct _product({double? amount}) => InventoryProduct(
  id: 'synthetic-product',
  name: 'Fractional coffee',
  wsId: 'synthetic-workspace',
  categoryId: 'category',
  ownerId: 'owner',
  inventory: [
    InventoryStockEntry(
      unitId: 'unit',
      warehouseId: 'warehouse',
      amount: amount,
      minAmount: 5,
      price: 12.5,
      unitName: 'Cup',
      warehouseName: 'Synthetic booth',
    ),
  ],
);
void _viewport(WidgetTester tester, Size size) {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

Widget _scaled(Widget child, double scale, GlobalKey key) => Builder(
  builder: (context) => MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
    child: shad.Theme(
      data: MobileShadTheme.light,
      child: DefaultTextStyle.merge(
        style: const TextStyle(fontFamily: 'NotoSans'),
        child: Theme(
          data: Theme.of(context).copyWith(
            textTheme: Theme.of(
              context,
            ).textTheme.apply(fontFamily: 'NotoSans'),
          ),
          child: RepaintBoundary(key: key, child: child),
        ),
      ),
    ),
  ),
);

Future<void> _capture(WidgetTester tester, GlobalKey key, String name) async {
  final directory = Platform.environment['INVENTORY_VISUAL_DIR'];
  if (directory == null) return;
  final boundary =
      key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  await tester.runAsync(() async {
    final image = await boundary.toImage();
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(directory).create(recursive: true);
    await File(
      '$directory/$name.png',
    ).writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final loader = FontLoader('NotoSans')
      ..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'));
    await loader.load();
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });
  testWidgets(
    'actual Overview keeps fractional minimum alongside fractional amount',
    (tester) async {
      _viewport(tester, const Size(390, 844));
      final workspace = _Workspace();
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(
          id: 'synthetic-workspace',
          name: 'Synthetic',
        ),
      );
      when(() => workspace.state).thenReturn(state);
      whenListen(
        workspace,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );
      final auth = _Auth();
      const authState = AuthState.authenticated(
        User(
          id: 'synthetic-actor',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '',
        ),
      );
      when(() => auth.state).thenReturn(authState);
      whenListen(
        auth,
        const Stream<AuthState>.empty(),
        initialState: authState,
      );
      final key = GlobalKey();
      final repository = _FractionalOverview();
      addTearDown(repository.dispose);
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<WorkspaceCubit>.value(value: workspace),
            BlocProvider<AuthCubit>.value(value: auth),
          ],
          child: _scaled(InventoryPage(repository: repository), 1, key),
        ),
      );
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('2.5 / 2.5'),
        300,
        maxScrolls: 10,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('2.5 / 2.5'), findsOneWidget);
      expect(find.text('2.5 / 3'), findsNothing);
      expect(find.text('Fractional beans'), findsOneWidget);
      await _capture(tester, key, 'compact-overview-fractional-minimum');
      await tester.pumpWidget(const SizedBox.shrink());
      expect(repository.disposed, isFalse);
      expect(tester.takeException(), isNull);
      await workspace.close();
      await auth.close();
    },
  );

  testWidgets(
    'actual Overview preserves small quantities at 320px and 2x text',
    (tester) async {
      _viewport(tester, const Size(320, 900));
      final workspace = _Workspace();
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(
          id: 'synthetic-workspace',
          name: 'Synthetic',
        ),
      );
      when(() => workspace.state).thenReturn(state);
      whenListen(
        workspace,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );
      final auth = _Auth();
      const authState = AuthState.authenticated(
        User(
          id: 'synthetic-actor',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '',
        ),
      );
      when(() => auth.state).thenReturn(authState);
      whenListen(
        auth,
        const Stream<AuthState>.empty(),
        initialState: authState,
      );
      final key = GlobalKey();
      final repository = _FractionalOverview(
        amount: 0.04,
        minimum: 0.123456789012345,
      );
      addTearDown(repository.dispose);
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<WorkspaceCubit>.value(value: workspace),
            BlocProvider<AuthCubit>.value(value: auth),
          ],
          child: _scaled(InventoryPage(repository: repository), 2, key),
        ),
      );
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('0.04 / 0.123456789012345'),
        300,
        maxScrolls: 10,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('0.04 / 0.123456789012345'), findsOneWidget);
      expect(find.text('0.0 / 0.1'), findsNothing);
      expect(
        tester.getTopLeft(find.text('0.04 / 0.123456789012345')).dy,
        greaterThan(tester.getBottomLeft(find.text('Fractional beans')).dy),
      );
      await Scrollable.ensureVisible(
        tester.element(find.text('0.04 / 0.123456789012345')),
        alignment: 0.5,
      );
      await tester.pumpAndSettle();
      expect(find.text('Fractional beans'), findsOneWidget);
      await _capture(tester, key, 'compact-overview-small-precision');
      await tester.pumpWidget(const SizedBox.shrink());
      expect(repository.disposed, isFalse);
      expect(tester.takeException(), isNull);
      await workspace.close();
      await auth.close();
    },
  );

  testWidgets('product stock keeps 0.04 readable at 320px and 2x text', (
    tester,
  ) async {
    _viewport(tester, const Size(320, 900));
    final key = GlobalKey();
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpApp(
        _scaled(
          shad.Scaffold(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                InventoryProductCard(
                  product: _product(amount: 0.04),
                  currency: 'USD',
                ),
              ],
            ),
          ),
          2,
          key,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('0.04 available'), findsOneWidget);
      expect(find.textContaining('0.0 available'), findsNothing);
      expect(find.bySemanticsLabel(RegExp('0.04 available')), findsOneWidget);
      expect(tester.takeException(), isNull);
      await _capture(tester, key, 'compact-product-small-precision');
    } finally {
      semantics.dispose();
    }
  });
}
