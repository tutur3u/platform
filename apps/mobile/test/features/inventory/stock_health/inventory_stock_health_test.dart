import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/inventory/inventory_stock_health.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/inventory/view/inventory_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_stock_health_panel.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';

class _Api extends Mock implements ApiClient {}

class _SecureStorage extends Mock implements FlutterSecureStorage {}

class _Inventory extends InventoryRepository {
  _Inventory() : super(apiClient: _Api());

  late Future<InventoryStockHealth> Function(String) loadHealth;
  final healthCalls = <String>[];

  @override
  Future<InventoryOverview> getOverview(
    String wsId, {
    bool forceRefresh = false,
  }) async => InventoryOverview.fromJson(const {});

  @override
  Future<InventoryStockHealth> getStockHealth(String wsId) {
    healthCalls.add(wsId);
    return loadHealth(wsId);
  }
}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

Map<String, dynamic> _payload() => {
  'generatedAt': '2026-10-01T09:00:00+07:00',
  'summary': <String, dynamic>{
    'activeProducts': 12,
    'stockedProducts': 9,
    'lowStockRows': 4,
    'outOfStockRows': 2,
    'unlimitedStockRows': 7,
    'revenue': 999999,
    'finiteStockUnits': 100000,
  },
};

Widget _panel(Future<InventoryStockHealth> future, {double scale = 1}) =>
    Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(textScaler: TextScaler.linear(scale)),
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
              child: shad.Scaffold(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [InventoryStockHealthPanel(future: future)],
                ),
              ),
            ),
          ),
        ),
      ),
    );

void main() {
  setUpAll(() async {
    await (FontLoader(
      'NotoSans',
    )..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'))).load();
  });

  testWidgets('Vietnamese overlap wording preserves separate unlimited count', (
    tester,
  ) async {
    await tester.pumpApp(
      Builder(
        builder: (context) => Localizations.override(
          context: context,
          locale: const Locale('vi'),
          child: _panel(
            Future.value(InventoryStockHealth.fromJson(_payload())),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Tooltip).first);
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Dòng tồn kho không giới hạn'), findsOneWidget);
    expect(find.text('7'), findsOneWidget);
    expect(
      find.textContaining('không tính dòng không giới hạn'),
      findsOneWidget,
    );
    expect(find.textContaining('các dòng này được đếm riêng'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('complete count scope preserves server UTC and ignores money/units', () {
    final data = InventoryStockHealth.fromJson(_payload());
    expect(data.generatedAt, DateTime.utc(2026, 10, 1, 2));
    expect(data.productsWithoutStock, 3);
    expect(data.lowStockRows, 4);
    expect(data.outOfStockRows, 2);
    expect(data.unlimitedStockRows, 7);
    expect(data.isComplete, isTrue);
  });

  test(
    'zero is valid; missing and malformed counts are partial, never zero',
    () {
      for (final value in [null, -1, 1.5, double.nan, double.infinity, '2']) {
        final json = _payload();
        (json['summary'] as Map)['lowStockRows'] = value;
        expect(InventoryStockHealth.fromJson(json).lowStockRows, isNull);
        expect(InventoryStockHealth.fromJson(json).isComplete, isFalse);
      }
      final json = _payload();
      (json['summary'] as Map)['lowStockRows'] = 0;
      expect(InventoryStockHealth.fromJson(json).lowStockRows, 0);
      expect(
        InventoryStockHealth.fromJson({'summary': null}).isComplete,
        isFalse,
      );
    },
  );

  test(
    'ambiguous timestamp and inconsistent product counts are unavailable',
    () {
      final json = _payload()..['generatedAt'] = '2026-10-01T09:00:00';
      (json['summary'] as Map)['stockedProducts'] = 13;
      final data = InventoryStockHealth.fromJson(json);
      expect(data.generatedAt, isNull);
      expect(data.productsWithoutStock, isNull);
      expect(data.isComplete, isFalse);
    },
  );

  test(
    'explicit aggregate revalidation propagates denial and removes snapshot',
    () async {
      final api = _Api();
      const path = '/api/v1/workspaces/ws/inventory/analytics/summary?days=30';
      when(() => api.getJson(path)).thenAnswer((_) async => _payload());
      final directory = await Directory.systemTemp.createTemp('stock-health-');
      final secure = _SecureStorage();
      final secrets = <String, String>{};
      when(() => secure.read(key: any(named: 'key'))).thenAnswer(
        (call) async => secrets[call.namedArguments[#key] as String],
      );
      when(
        () => secure.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((call) async {
        secrets[call.namedArguments[#key] as String] =
            call.namedArguments[#value] as String;
      });
      final store = CacheStore.forTesting(
        secureStorage: secure,
        directoryResolver: () async => directory,
      );
      addTearDown(() async {
        await store.closeForTesting();
        await directory.delete(recursive: true);
      });
      final repository = InventoryRepository(
        apiClient: api,
        cacheStore: store,
        cacheUserId: () => 'stock-health-actor',
      );
      expect((await repository.getStockHealth('ws')).activeProducts, 12);
      final before = await store.read<Map<String, dynamic>>(
        key: CacheKey(
          namespace: 'inventory.stock-health',
          userId: 'stock-health-actor',
          workspaceId: 'ws',
          locale: currentCacheLocaleTag(),
        ),
        decode: (json) => Map<String, dynamic>.from(json! as Map),
      );
      expect(before.hasValue, isTrue);
      when(
        () => api.getJson(path),
      ).thenThrow(const ApiException(message: 'Forbidden', statusCode: 403));
      await expectLater(
        CacheStore.awaitRevalidation(() => repository.getStockHealth('ws')),
        throwsA(isA<ApiException>()),
      );
      final snapshot = await store.read<Map<String, dynamic>>(
        key: CacheKey(
          namespace: 'inventory.stock-health',
          userId: 'stock-health-actor',
          workspaceId: 'ws',
          locale: currentCacheLocaleTag(),
        ),
        decode: (json) => Map<String, dynamic>.from(json! as Map),
      );
      expect(snapshot.hasValue, isFalse);
      verify(() => api.getJson(path)).called(2);
      verifyNoMoreInteractions(api);
    },
  );

  for (final width in [320.0, 768.0]) {
    testWidgets('count bars and scope fit width $width with large text', (
      tester,
    ) async {
      tester.view
        ..physicalSize = Size(width, 1100)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final semantics = tester.ensureSemantics();
      try {
        final key = GlobalKey();
        await tester.pumpApp(
          RepaintBoundary(
            key: key,
            child: _panel(
              Future.value(InventoryStockHealth.fromJson(_payload())),
              scale: 1.5,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(
          find.text('Server snapshot: 2026-10-01 02:00:00 UTC'),
          findsOneWidget,
        );
        await tester.tap(find.byType(Tooltip).first);
        await tester.pump(const Duration(milliseconds: 200));
        expect(find.bySemanticsLabel('Low stock rows: 4'), findsOneWidget);
        expect(
          find.textContaining('including archived warehouses'),
          findsOneWidget,
        );
        expect(
          find.textContaining('Low/out counts can overlap'),
          findsOneWidget,
        );
        expect(
          find.textContaining('Unlimited rows are counted separately'),
          findsOneWidget,
        );
        expect(find.textContaining('999999'), findsNothing);
        final bars = tester.widgetList<LinearProgressIndicator>(
          find.byType(LinearProgressIndicator),
        );
        expect(bars.map((bar) => bar.value), [4 / 7, 2 / 7, 1]);
        final directory = Platform.environment['INVENTORY_VISUAL_DIR'];
        if (directory != null) {
          await tester.runAsync(() async {
            final image =
                await (key.currentContext!.findRenderObject()!
                        as RenderRepaintBoundary)
                    .toImage();
            final bytes = await image.toByteData(
              format: ui.ImageByteFormat.png,
            );
            await Directory(directory).create(recursive: true);
            await File(
              '$directory/stock-health-${width.toInt()}.png',
            ).writeAsBytes(bytes!.buffer.asUint8List());
            image.dispose();
          });
        }
      } finally {
        semantics.dispose();
      }
    });
  }

  testWidgets(
    'partial snapshot labels unknown separately from confirmed zero',
    (tester) async {
      final json = _payload();
      (json['summary'] as Map)
        ..remove('lowStockRows')
        ..['outOfStockRows'] = 0;
      await tester.pumpApp(
        _panel(Future.value(InventoryStockHealth.fromJson(json))),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Partial snapshot:'), findsOneWidget);
      expect(find.text('Unavailable'), findsOneWidget);
      expect(find.text('0'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsNWidgets(2));
    },
  );

  testWidgets(
    'refresh denial removes visible counts, never shows cached zeros',
    (tester) async {
      final initial = Future.value(InventoryStockHealth.fromJson(_payload()));
      final future = ValueNotifier<Future<InventoryStockHealth>>(initial);
      addTearDown(future.dispose);
      await tester.pumpApp(
        ValueListenableBuilder<Future<InventoryStockHealth>>(
          valueListenable: future,
          builder: (context, value, child) => _panel(value),
        ),
      );
      await tester.pumpAndSettle();
      final refresh = Completer<InventoryStockHealth>();
      future.value = refresh.future;
      await tester.pump();
      refresh.completeError(
        const ApiException(message: 'Forbidden', statusCode: 403),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('You do not have access to stock analytics.'),
        findsOneWidget,
      );
      expect(find.text('12'), findsNothing);
      expect(find.byType(LinearProgressIndicator), findsNothing);
    },
  );

  testWidgets('Android short Overview drag retries failed stock health', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(1024, 1600)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final auth = _Auth();
    final workspace = _Workspace();
    final repository = _Inventory();
    addTearDown(repository.dispose);
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.authenticated(
        User(
          id: 'actor',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '',
        ),
      ),
    );
    whenListen(
      workspace,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        currentWorkspace: Workspace(id: 'ws', name: 'Synthetic workspace'),
      ),
    );
    repository.loadHealth = (_) async {
      if (repository.healthCalls.length == 1) {
        throw const ApiException(message: 'Unavailable', statusCode: 500);
      }
      return InventoryStockHealth.fromJson(_payload());
    };
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
        ],
        child: InventoryPage(repository: repository),
      ),
    );
    await tester.pumpAndSettle();
    const error = 'Stock health is unavailable. Pull to refresh to try again.';
    expect(find.text(error), findsOneWidget);
    expect(repository.healthCalls, ['ws']);
    final scrollable = tester.state<ScrollableState>(find.byType(Scrollable));
    expect(
      scrollable.position.maxScrollExtent,
      0,
      reason: 'The regression must exercise content shorter than its viewport.',
    );

    await tester.drag(find.byType(ListView), const Offset(0, 500));
    await tester.pumpAndSettle();
    expect(repository.healthCalls, ['ws', 'ws']);
    expect(find.text(error), findsNothing);
    expect(find.text('12'), findsOneWidget);
    expect(tester.takeException(), isNull);
  }, variant: TargetPlatformVariant.only(TargetPlatform.android));

  testWidgets('mounted Overview clears old actor/workspace pending results', (
    tester,
  ) async {
    final auth = _Auth();
    final workspace = _Workspace();
    final repository = _Inventory();
    final authStates = StreamController<AuthState>.broadcast();
    final workspaceStates = StreamController<WorkspaceState>.broadcast();
    addTearDown(authStates.close);
    addTearDown(workspaceStates.close);
    AuthState actor(String id) => AuthState.authenticated(
      User(
        id: id,
        appMetadata: const {},
        userMetadata: const {},
        aud: 'authenticated',
        createdAt: '',
      ),
    );
    WorkspaceState scope(String id) => WorkspaceState(
      currentWorkspace: Workspace(id: id, name: id),
    );
    whenListen(auth, authStates.stream, initialState: actor('actor-a'));
    whenListen(workspace, workspaceStates.stream, initialState: scope('ws-a'));
    addTearDown(repository.dispose);
    final pending = Completer<InventoryStockHealth>();
    repository.loadHealth = (wsId) => wsId == 'ws-a'
        ? pending.future
        : Future.value(
            InventoryStockHealth.fromJson(
              _payload()
                ..['summary'] = {
                  'activeProducts': 99,
                  'stockedProducts': 99,
                  'lowStockRows': 0,
                  'outOfStockRows': 0,
                  'unlimitedStockRows': 0,
                },
            ),
          );
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
        ],
        child: InventoryPage(repository: repository),
      ),
    );
    await tester.pumpAndSettle();
    authStates.add(actor('actor-b'));
    workspaceStates.add(scope('ws-b'));
    await tester.pumpAndSettle();
    pending.complete(InventoryStockHealth.fromJson(_payload()));
    await tester.pumpAndSettle();
    expect(find.text('99'), findsOneWidget);
    expect(find.text('12'), findsNothing);
    final denied = Completer<InventoryStockHealth>();
    repository.loadHealth = (_) => denied.future;
    authStates.add(actor('actor-c'));
    await tester.pumpAndSettle();
    expect(find.text('99'), findsNothing);
    denied.completeError(
      const ApiException(message: 'Forbidden', statusCode: 403),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('You do not have access to stock analytics.'),
      findsOneWidget,
    );
    expect(find.text('99'), findsNothing);
    expect(
      repository.healthCalls.where((id) => id == 'ws-b').length,
      greaterThanOrEqualTo(1),
    );
    expect(tester.takeException(), isNull);
  });
}
