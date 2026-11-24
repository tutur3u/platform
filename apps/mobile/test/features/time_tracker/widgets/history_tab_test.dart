import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
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

  group('HistoryTab day group headers', () {
    late _MockTimeTrackerCubit timeTrackerCubit;
    late _MockWorkspaceCubit workspaceCubit;

    setUp(() {
      timeTrackerCubit = _MockTimeTrackerCubit();
      workspaceCubit = _MockWorkspaceCubit();
    });

    // 2030-01-15 is a Tuesday.
    final sessionStart = DateTime(2030, 1, 15, 9);

    Future<void> pumpHistory(WidgetTester tester, Locale locale) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(900, 1600);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      whenListen(
        timeTrackerCubit,
        const Stream<TimeTrackerState>.empty(),
        initialState: TimeTrackerState(
          status: TimeTrackerStatus.loaded,
          historyAnchorDate: sessionStart,
          historySessions: [
            TimeTrackingSession(
              id: 'session-1',
              title: 'Synthetic session',
              startTime: sessionStart,
              endTime: sessionStart.add(const Duration(hours: 1)),
            ),
          ],
        ),
      );
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: const WorkspaceState(),
      );

      await tester.pumpWidget(
        sorbetTestApp(
          locale: locale,
          home: Scaffold(
            body: MultiBlocProvider(
              providers: [
                BlocProvider<TimeTrackerCubit>.value(value: timeTrackerCubit),
                BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
              ],
              child: const HistoryTab(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('groups sessions under a Vietnamese date header in vi', (
      tester,
    ) async {
      await pumpHistory(tester, const Locale('vi'));

      final viHeader = DateFormat.yMMMEd('vi').format(sessionStart);
      final enHeader = DateFormat.yMMMEd('en').format(sessionStart);
      expect(find.text(viHeader), findsOneWidget);
      expect(find.text(enHeader), findsNothing);
      expect(viHeader, 'Th 3, 15 thg 1, 2030');
    });

    testWidgets('groups sessions under an English date header in en', (
      tester,
    ) async {
      await pumpHistory(tester, const Locale('en'));

      expect(
        find.text(DateFormat.yMMMEd('en').format(sessionStart)),
        findsOneWidget,
      );
    });
  });
}
