import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/widgets/timer_display.dart';
import 'package:mobile/features/time_tracker/widgets/timer_dock_actions.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets('session controls hand off in one shell registration', (
    tester,
  ) async {
    final shell = ShellChromeActionsCubit();
    addTearDown(shell.close);
    var starts = 0;
    var pauses = 0;
    var resumes = 0;
    var stops = 0;
    Future<void> show({
      bool running = false,
      bool paused = false,
      bool busy = false,
    }) async {
      await tester.pumpApp(
        BlocProvider.value(
          value: shell,
          child: TimerDockActions(
            isRunning: running,
            isPaused: paused,
            enabled: !busy,
            primaryLoading: busy,
            stopLoading: false,
            onStart: () => starts++,
            onPause: () => pauses++,
            onResume: () => resumes++,
            onStop: () => stops++,
          ),
        ),
      );
      await tester.pump();
    }

    await show();
    var actions = shell.state.resolveForLocation(Routes.timer);
    expect(actions.single.inDock, isTrue);
    expect(actions.single.tooltip, 'Start');
    actions.single.onPressed!();
    expect(starts, 1);
    await show(running: true);
    actions = shell.state.resolveForLocation(Routes.timer);
    expect(actions.map((action) => action.id).toSet().length, 2);
    expect(actions.first.tooltip, 'Pause');
    actions.first.onPressed!();
    actions.last.onPressed!();
    expect(pauses, 1);
    expect(stops, 1);
    await show(paused: true, busy: true);
    actions = shell.state.resolveForLocation(Routes.timer);
    expect(actions.first.tooltip, 'Resume');
    expect(actions.every((action) => !action.enabled), isTrue);
    expect(actions.first.isLoading, isTrue);
    await show(paused: true);
    shell.state.resolveForLocation(Routes.timer).first.onPressed!();
    expect(resumes, 1);
    expect(shell.state.resolveForLocation(Routes.apps), isEmpty);
    await tester.pumpApp(const SizedBox.shrink());
    await tester.pump();
    expect(shell.state.resolveForLocation(Routes.timer), isEmpty);
  });

  testWidgets('long-running clock fits narrow enlarged-text layout', (
    tester,
  ) async {
    await tester.pumpApp(
      const MediaQuery(
        data: MediaQueryData(
          size: Size(320, 700),
          textScaler: TextScaler.linear(3),
        ),
        child: SizedBox(
          width: 320,
          child: TimerDisplay(
            elapsed: Duration(hours: 123, minutes: 45, seconds: 6),
            isRunning: true,
            isPaused: false,
            pomodoroPhase: PomodoroPhase.focus,
          ),
        ),
      ),
    );
    expect(find.text('123:45:06'), findsOneWidget);
    expect(find.text('Running'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Pomodoro phase is localized rather than fixed English', (
    tester,
  ) async {
    await tester.pumpApp(
      Builder(
        builder: (context) => Localizations.override(
          context: context,
          locale: const Locale('vi'),
          child: const TimerDisplay(
            elapsed: Duration.zero,
            isRunning: false,
            isPaused: true,
            pomodoroPhase: PomodoroPhase.shortBreak,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pumpAndSettle();
    expect(find.text('Nghỉ ngắn'), findsOneWidget);
    expect(find.text('Short Break'), findsNothing);
    expect(find.text('Short break'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
