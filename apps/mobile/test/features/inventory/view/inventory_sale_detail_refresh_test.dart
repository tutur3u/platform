import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/inventory/view/inventory_sales_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_read_warning.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';

class _Inventory extends Mock implements InventoryRepository {}

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

Map<String, dynamic> detail(String notice) => {
  'data': {
    'id': 'sale',
    'notice': notice,
    'paid_amount': 10,
    'items_count': 0,
    'total_quantity': 0,
    'lines': <Map<String, dynamic>>[],
  },
};

void main() {
  late _Inventory repository;
  late _Auth auth;
  late _Workspace workspace;
  late StreamController<AuthState> authChanges;
  late StreamController<WorkspaceState> workspaceChanges;

  setUp(() async {
    repository = _Inventory();
    auth = _Auth();
    workspace = _Workspace();
    authChanges = StreamController<AuthState>.broadcast();
    workspaceChanges = StreamController<WorkspaceState>.broadcast();
    whenListen(
      auth,
      authChanges.stream,
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
      workspaceChanges.stream,
      initialState: const WorkspaceState(
        currentWorkspace: Workspace(id: 'ws', name: 'Workspace'),
      ),
    );
    when(() => repository.peekSaleDetail('ws', 'sale')).thenReturn(
      InventorySaleDetail.fromJson(
        detail('Saved sale')['data'] as Map<String, dynamic>,
      ),
    );
  });

  tearDown(() async {
    await authChanges.close();
    await workspaceChanges.close();
    await auth.close();
    await workspace.close();
  });

  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1000, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
        ],
        child: InventorySaleDetailDialog(
          wsId: 'ws',
          saleId: 'sale',
          currency: 'USD',
          inventoryRepository: repository,
          canUpdateSales: false,
          canDeleteSales: false,
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets(
    'fresh saved detail appears while entry revalidation is pending',
    (tester) async {
      final response = Completer<InventorySaleDetail>();
      when(
        () => repository.getSaleDetail(
          'ws',
          'sale',
          forceRefresh: any(named: 'forceRefresh'),
        ),
      ).thenAnswer((_) => response.future);
      await open(tester);
      expect(find.text('Saved sale'), findsOneWidget);
      verify(() => repository.getSaleDetail('ws', 'sale')).called(1);
      response.complete(
        InventorySaleDetail.fromJson(
          detail('Current sale')['data'] as Map<String, dynamic>,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Current sale'), findsOneWidget);
      expect(find.text('Saved sale'), findsNothing);
    },
  );

  testWidgets(
    'refresh failure retains detail and retry is awaitable and replaces it',
    (tester) async {
      final response = Completer<InventorySaleDetail>();
      when(
        () => repository.getSaleDetail(
          'ws',
          'sale',
          forceRefresh: any(named: 'forceRefresh'),
        ),
      ).thenAnswer((_) => response.future);
      await open(tester);
      response.completeError(
        const ApiException.transport(message: 'Disconnected'),
      );
      await tester.pumpAndSettle();
      expect(find.text('Saved sale'), findsOneWidget);
      expect(find.byType(InventoryReadWarning), findsOneWidget);
      final retry = Completer<InventorySaleDetail>();
      when(
        () => repository.getSaleDetail('ws', 'sale', forceRefresh: true),
      ).thenAnswer((_) => retry.future);
      await tester.tap(find.text('Retry'));
      await tester.pump();
      expect(find.text('Saved sale'), findsOneWidget);
      retry.complete(
        InventorySaleDetail.fromJson(
          detail('Retried sale')['data'] as Map<String, dynamic>,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Retried sale'), findsOneWidget);
      expect(find.byType(InventoryReadWarning), findsNothing);
    },
  );

  testWidgets('denied refresh clears previously authorized detail', (
    tester,
  ) async {
    final response = Completer<InventorySaleDetail>();
    when(
      () => repository.getSaleDetail(
        'ws',
        'sale',
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) => response.future);
    await open(tester);
    response.completeError(
      const ApiException(message: 'Denied', statusCode: 403),
    );
    await tester.pumpAndSettle();
    expect(find.text('Saved sale'), findsNothing);
    expect(find.textContaining('Denied'), findsOneWidget);
  });

  testWidgets('account change clears snapshot and ignores late response', (
    tester,
  ) async {
    final response = Completer<InventorySaleDetail>();
    when(
      () => repository.getSaleDetail(
        'ws',
        'sale',
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) => response.future);
    await open(tester);
    authChanges.add(const AuthState.unauthenticated());
    await tester.pump();
    await tester.pump();
    expect(find.text('Saved sale'), findsNothing);
    response.complete(
      InventorySaleDetail.fromJson(
        detail('Late sale')['data'] as Map<String, dynamic>,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Late sale'), findsNothing);
  });

  testWidgets('workspace change clears snapshot and ignores late response', (
    tester,
  ) async {
    final response = Completer<InventorySaleDetail>();
    when(
      () => repository.getSaleDetail(
        'ws',
        'sale',
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) => response.future);
    await open(tester);
    workspaceChanges.add(
      const WorkspaceState(
        currentWorkspace: Workspace(id: 'other', name: 'Other workspace'),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Saved sale'), findsNothing);
    response.complete(
      InventorySaleDetail.fromJson(
        detail('Late sale')['data'] as Map<String, dynamic>,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Late sale'), findsNothing);
  });
}
