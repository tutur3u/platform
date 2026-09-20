import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/widgets/history_period_controls.dart';
import 'package:mobile/features/time_tracker/widgets/history_tab.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

import '../../../helpers/helpers.dart';

class _MockTimeTrackerCubit extends MockCubit<TimeTrackerState>
    implements TimeTrackerCubit {}

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

void main() {
  group('HistoryTab loading behavior', () {
    late _MockTimeTrackerCubit timeTrackerCubit;
    late _MockWorkspaceCubit workspaceCubit;

    setUp(() {
      timeTrackerCubit = _MockTimeTrackerCubit();
      workspaceCubit = _MockWorkspaceCubit();
    });

    testWidgets('keeps period controls visible during history loading', (
      tester,
    ) async {
      final loadingState = TimeTrackerState(
        status: TimeTrackerStatus.loaded,
        historyAnchorDate: DateTime(2026, 2),
        isHistoryLoading: true,
      );
      const workspaceState = WorkspaceState();

      whenListen(
        timeTrackerCubit,
        const Stream<TimeTrackerState>.empty(),
        initialState: loadingState,
      );
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: workspaceState,
      );

      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<TimeTrackerCubit>.value(value: timeTrackerCubit),
            BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
          ],
          child: const HistoryTab(),
        ),
      );

      expect(find.byType(HistoryPeriodControls), findsOneWidget);
      expect(find.byIcon(Icons.chevron_left), findsOneWidget);
      expect(find.byType(NovaLoadingIndicator), findsWidgets);
    });
  });
}
