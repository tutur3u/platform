import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_requests_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _MockTimeTrackerRepository extends Mock
    implements ITimeTrackerRepository {}

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('TimeTrackerRequestsPage workspace switching', () {
    late _MockTimeTrackerRepository repository;
    late _MockWorkspaceCubit workspaceCubit;
    late _MockAuthCubit authCubit;
    late StreamController<WorkspaceState> workspaceController;
    late WorkspaceState currentWorkspaceState;

    const ws1 = Workspace(id: 'ws-1', name: 'Workspace 1');
    const ws2 = Workspace(id: 'ws-2', name: 'Workspace 2');

    setUp(() {
      repository = _MockTimeTrackerRepository();
      workspaceCubit = _MockWorkspaceCubit();
      authCubit = _MockAuthCubit();
      workspaceController = StreamController<WorkspaceState>();

      currentWorkspaceState = const WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: ws1,
      );

      when(() => workspaceCubit.state).thenAnswer((_) => currentWorkspaceState);
      whenListen(
        workspaceCubit,
        workspaceController.stream,
        initialState: currentWorkspaceState,
      );

      when(() => authCubit.state).thenReturn(const AuthState.unauthenticated());
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: const AuthState.unauthenticated(),
      );
    });

    setUpAll(() async {
      SharedPreferences.setMockInitialValues(const <String, Object>{});
      await supa.Supabase.initialize(
        url: 'https://example.supabase.co',
        anonKey:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhbm9uIjoidGVzdCJ9.test',
      );
    });

    tearDown(() async {
      await workspaceController.close();
    });

    testWidgets(
      'clears previous workspace requests immediately after wsId change',
      (tester) async {
        when(
          () => repository.getRequests('ws-1', status: 'pending'),
        ).thenAnswer(
          (_) async => [_request('req-ws1', title: 'WS1 Request')],
        );

        final ws2Completer = Completer<List<TimeTrackingRequest>>();
        when(
          () => repository.getRequests('ws-2', status: 'pending'),
        ).thenAnswer((_) => ws2Completer.future);

        await tester.pumpApp(
          MultiBlocProvider(
            providers: [
              BlocProvider<AuthCubit>.value(value: authCubit),
              BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
            ],
            child: TimeTrackerRequestsPage(repository: repository),
          ),
        );

        await tester.pump();
        await _pumpUntilFound(tester, find.text('WS1 Request'));
        expect(find.text('WS1 Request'), findsOneWidget);

        currentWorkspaceState = const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: ws2,
        );
        workspaceController.add(currentWorkspaceState);
        await tester.pump();
        await _pumpUntilAbsent(tester, find.text('WS1 Request'));

        expect(find.text('WS1 Request'), findsNothing);
        expect(find.byType(shad.CircularProgressIndicator), findsWidgets);

        ws2Completer.complete([_request('req-ws2', title: 'WS2 Request')]);
        await tester.pump();
        await tester.pump();

        expect(find.text('WS2 Request'), findsOneWidget);
      },
    );

    testWidgets('ignores stale request response from previous workspace', (
      tester,
    ) async {
      final ws1Completer = Completer<List<TimeTrackingRequest>>();
      when(
        () => repository.getRequests('ws-1', status: 'pending'),
      ).thenAnswer((_) => ws1Completer.future);

      when(
        () => repository.getRequests('ws-2', status: 'pending'),
      ).thenAnswer(
        (_) async => [_request('req-ws2', title: 'WS2 Request')],
      );

      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: authCubit),
            BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
          ],
          child: TimeTrackerRequestsPage(repository: repository),
        ),
      );

      currentWorkspaceState = const WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: ws2,
      );
      workspaceController.add(currentWorkspaceState);
      await tester.pump();
      await tester.pump();

      expect(find.text('WS2 Request'), findsOneWidget);

      ws1Completer.complete([_request('req-ws1', title: 'WS1 Request')]);
      await tester.pump();

      expect(find.text('WS1 Request'), findsNothing);
      expect(find.text('WS2 Request'), findsOneWidget);
    });
  });
}

Future<void> _pumpUntilFound(WidgetTester tester, Finder finder) async {
  for (var i = 0; i < 20; i++) {
    if (finder.evaluate().isNotEmpty) {
      return;
    }
    await tester.pump(const Duration(milliseconds: 20));
  }
}

Future<void> _pumpUntilAbsent(WidgetTester tester, Finder finder) async {
  for (var i = 0; i < 20; i++) {
    if (finder.evaluate().isEmpty) {
      return;
    }
    await tester.pump(const Duration(milliseconds: 20));
  }
}

TimeTrackingRequest _request(String id, {required String title}) {
  return TimeTrackingRequest(
    id: id,
    title: title,
  );
}
