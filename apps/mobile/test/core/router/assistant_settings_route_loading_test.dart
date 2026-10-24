import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/assistant_settings_route.dart';
import 'package:mobile/features/assistant/view/assistant_settings_route_frame.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

import '../../helpers/pump_app.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

void main() {
  for (final workspaceStatus in [
    WorkspaceStatus.initial,
    WorkspaceStatus.loading,
  ]) {
    testWidgets(
      'cold Assistant route keeps frame and progress $workspaceStatus',
      (tester) async {
        final auth = _Auth();
        final workspaces = _Workspaces();
        whenListen(
          auth,
          const Stream<AuthState>.empty(),
          initialState: const AuthState.unknown(),
        );
        whenListen(
          workspaces,
          const Stream<WorkspaceState>.empty(),
          initialState: WorkspaceState(status: workspaceStatus),
        );
        addTearDown(auth.close);
        addTearDown(workspaces.close);
        await tester.pumpApp(
          MultiBlocProvider(
            providers: [
              BlocProvider<AuthCubit>.value(value: auth),
              BlocProvider<WorkspaceCubit>.value(value: workspaces),
            ],
            child: const AssistantSettingsRoute(),
          ),
        );
        await tester.pump();
        expect(find.byType(AssistantSettingsRouteFrame), findsOneWidget);
        expect(find.byType(NovaLoadingIndicator), findsOneWidget);
        expect(find.bySemanticsLabel('Loading'), findsOneWidget);
        expect(find.text('Assistant Settings'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets('a terminal absent account does not show endless progress', (
    tester,
  ) async {
    final auth = _Auth();
    final workspaces = _Workspaces();
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.unauthenticated(),
    );
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(status: WorkspaceStatus.loaded),
    );
    addTearDown(auth.close);
    addTearDown(workspaces.close);
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
        ],
        child: const AssistantSettingsRoute(),
      ),
    );
    await tester.pump();
    expect(find.byType(AssistantSettingsRouteFrame), findsOneWidget);
    expect(find.byType(NovaLoadingIndicator), findsNothing);
    expect(find.text('No workspaces found'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
