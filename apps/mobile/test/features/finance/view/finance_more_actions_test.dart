import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/finance/finance_module.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/view/finance_more_actions.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _WorkspaceCubit extends Mock implements WorkspaceCubit {}

class _FinanceRepository extends Mock implements FinanceRepository {}

void main() {
  testWidgets('a More tool without its grant explains instead of loading', (
    tester,
  ) async {
    final workspace = _WorkspaceCubit();
    when(
      () => workspace.state,
    ).thenReturn(const WorkspaceState(currentWorkspace: Workspace(id: 'ws')));
    when(() => workspace.stream).thenAnswer((_) => const Stream.empty());
    final repository = _FinanceRepository();
    late BuildContext tools;
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: workspace,
        child: RepositoryProvider<FinanceRepository>.value(
          value: repository,
          child: FinanceTestGrants(
            permissions: const WorkspacePermissions(
              permissions: {'view_transactions'},
              isCreator: false,
            ),
            child: Builder(
              builder: (context) {
                tools = context;
                return const SizedBox.expand();
              },
            ),
          ),
        ),
      ),
    );

    for (final action in [
      FinanceMoreAction.reports,
      FinanceMoreAction.invoices,
    ]) {
      expect(action.allowed(tools), isFalse);
      await openFinanceMoreAction(tools, action);
      await tester.pump();
      expect(
        find.text('You don’t have access to this finance information.'),
        findsWidgets,
      );
    }
    expect(FinanceMoreAction.recurring.allowed(tools), isTrue);
    verifyZeroInteractions(repository);
    await tester.drainShadToastTimers();
  });

  testWidgets('grant readiness is reported once grants settle', (tester) async {
    var opened = 0;
    final ready = ValueNotifier(false);
    addTearDown(ready.dispose);
    await tester.pumpApp(
      ValueListenableBuilder<bool>(
        valueListenable: ready,
        builder: (_, value, _) => FinanceTestGrants(
          permissions: value
              ? const WorkspacePermissions(
                  permissions: {'view_invoices'},
                  isCreator: false,
                )
              : null,
          ready: value,
          child: FinanceGrantsReady(
            onChanged: (ready) {
              if (ready) opened++;
            },
            child: const SizedBox.expand(),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(opened, 0);
    ready.value = true;
    await tester.pump();
    await tester.pump();
    expect(opened, 1);
    ready.value = false;
    await tester.pump();
    await tester.pump();
    expect(opened, 1);
    ready.value = true;
    await tester.pump();
    await tester.pump();
    expect(opened, 2);
  });

  testWidgets('a workspace switch during the reads drops the tool', (
    tester,
  ) async {
    final workspace = _WorkspaceCubit();
    final changes = StreamController<WorkspaceState>.broadcast();
    addTearDown(changes.close);
    var state = const WorkspaceState(currentWorkspace: Workspace(id: 'a'));
    when(() => workspace.state).thenAnswer((_) => state);
    when(() => workspace.stream).thenAnswer((_) => changes.stream);
    final repository = _FinanceRepository();
    final currency = Completer<String>();
    when(
      () => repository.getWorkspaceDefaultCurrency('a'),
    ).thenAnswer((_) => currency.future);
    late BuildContext tools;
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: workspace,
        child: RepositoryProvider<FinanceRepository>.value(
          value: repository,
          child: Builder(
            builder: (context) {
              tools = context;
              return const SizedBox.expand();
            },
          ),
        ),
      ),
    );
    final opening = openFinanceMoreAction(tools, FinanceMoreAction.recurring);
    state = const WorkspaceState(currentWorkspace: Workspace(id: 'b'));
    changes.add(state);
    await tester.pump();
    state = const WorkspaceState(currentWorkspace: Workspace(id: 'a'));
    changes.add(state);
    await tester.pump();
    currency.complete('USD');
    await opening;
    await tester.pump();
    verify(() => repository.getWorkspaceDefaultCurrency('a')).called(1);
    verifyNoMoreInteractions(repository);
  });

  testWidgets('a deep-linked tool still lands when grants never settle', (
    tester,
  ) async {
    final router = GoRouter(
      initialLocation: Routes.financeReports,
      routes: [
        GoRoute(
          path: Routes.financeReports,
          builder: (context, state) => const FinanceTestGrants(
            permissions: null,
            ready: false,
            child: FinanceDockRegistration(
              location: Routes.financeReports,
              openActionOnEntry: FinanceMoreAction.reports,
              child: SizedBox.shrink(),
            ),
          ),
        ),
        GoRoute(
          path: Routes.finance,
          builder: (context, state) => const Text('overview'),
        ),
      ],
    );
    addTearDown(router.dispose);
    final workspace = _WorkspaceCubit();
    when(
      () => workspace.state,
    ).thenReturn(const WorkspaceState(currentWorkspace: Workspace(id: 'ws')));
    when(() => workspace.stream).thenAnswer((_) => const Stream.empty());
    await tester.pumpAppRouter(
      router,
      wrap: (app) => BlocProvider<WorkspaceCubit>.value(
        value: workspace,
        child: BlocProvider(create: (_) => ShellMiniNavCubit(), child: app),
      ),
    );
    await tester.pump(const Duration(seconds: 14));
    expect(find.text('overview'), findsNothing);
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.text('overview'), findsOneWidget);
    expect(
      find.text(
        "Couldn't load your finance data. Check your connection and "
        'try again.',
      ),
      findsWidgets,
    );
    await tester.drainShadToastTimers();
  });

  testWidgets('a deep link follows a workspace switch before it opens', (
    tester,
  ) async {
    final ready = ValueNotifier(false);
    addTearDown(ready.dispose);
    final router = GoRouter(
      initialLocation: Routes.financeReports,
      routes: [
        GoRoute(
          path: Routes.financeReports,
          builder: (context, state) => ValueListenableBuilder<bool>(
            valueListenable: ready,
            builder: (_, value, _) => FinanceTestGrants(
              permissions: value
                  ? const WorkspacePermissions(
                      permissions: {'view_transactions'},
                      isCreator: false,
                    )
                  : null,
              ready: value,
              child: const FinanceDockRegistration(
                location: Routes.financeReports,
                openActionOnEntry: FinanceMoreAction.reports,
                child: SizedBox.shrink(),
              ),
            ),
          ),
        ),
        GoRoute(
          path: Routes.finance,
          builder: (context, state) => const Text('overview'),
        ),
      ],
    );
    addTearDown(router.dispose);
    final workspace = _WorkspaceCubit();
    final changes = StreamController<WorkspaceState>.broadcast();
    addTearDown(changes.close);
    var state = const WorkspaceState(currentWorkspace: Workspace(id: 'a'));
    when(() => workspace.state).thenAnswer((_) => state);
    when(() => workspace.stream).thenAnswer((_) => changes.stream);
    await tester.pumpAppRouter(
      router,
      wrap: (app) => BlocProvider<WorkspaceCubit>.value(
        value: workspace,
        child: BlocProvider(create: (_) => ShellMiniNavCubit(), child: app),
      ),
    );
    state = const WorkspaceState(currentWorkspace: Workspace(id: 'b'));
    changes.add(state);
    await tester.pump();
    ready.value = true;
    await tester.pumpAndSettle();
    expect(find.text('overview'), findsOneWidget);
    // The restarted entry checked B's grants rather than silently dropping.
    expect(
      find.text('You don’t have access to this finance information.'),
      findsWidgets,
    );
    await tester.drainShadToastTimers();
  });
}
