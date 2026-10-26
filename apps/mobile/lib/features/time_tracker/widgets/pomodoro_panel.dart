import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_controller.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_sessions.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_state.dart';
import 'package:mobile/features/time_tracker/widgets/focus_timer_ring.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Timer tab's Pomodoro: start a focus phase for the task the timer is
/// set up for, then pause, resume, skip or stop it. The countdown runs on
/// this device; focus phases are ordinary tracked sessions.
class PomodoroPanel extends StatefulWidget {
  const PomodoroPanel({super.key});

  @override
  State<PomodoroPanel> createState() => _PomodoroPanelState();
}

class _PomodoroPanelState extends State<PomodoroPanel> {
  Timer? _tick;
  bool _busy = false;

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  void _syncTick(PomodoroState state) {
    if (state.isRunning) {
      _tick ??= Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
    } else {
      _tick?.cancel();
      _tick = null;
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    final l10n = context.l10n;
    try {
      await action();
      if (!mounted) return;
      final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
      final userId = context.read<AuthCubit>().state.user?.id;
      if (wsId != null && userId != null) {
        unawaited(
          context.read<TimeTrackerCubit>().loadData(
            wsId,
            userId,
            forceRefresh: true,
          ),
        );
      }
    } on PomodoroSessionConflict {
      if (mounted) _error(l10n.timerPomodoroOtherRunning, '');
    } on ApiException catch (error) {
      if (mounted) _error(error.message, l10n.commonSomethingWentWrong);
    } on Exception {
      if (mounted) _error(null, l10n.commonSomethingWentWrong);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _error(String? message, String fallback) => showAppToast(
    context,
    message: message?.trim().isNotEmpty == true ? message! : fallback,
    variant: AppAlertVariant.destructive,
  );

  /// Starts focus the way Start focus on a task row does: a running or
  /// paused session is replaced only after confirmation, and a paused one is
  /// stopped first, which closes its break.
  Future<void> _start(PomodoroController controller) async {
    final l10n = context.l10n;
    final timer = context.read<TimeTrackerCubit>().state;
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    final userId = context.read<AuthCubit>().state.user?.id;
    if (wsId == null || userId == null) return;
    setState(() => _busy = true);
    final ({TimeTrackingSession? running, TimeTrackingSession? paused})
    tracking;
    try {
      tracking = await controller.currentTracking(wsId);
    } on Exception {
      if (mounted) {
        setState(() => _busy = false);
        _error(null, l10n.commonSomethingWentWrong);
      }
      return;
    }
    if (!mounted) return;
    setState(() => _busy = false);
    final paused = tracking.paused;
    if (tracking.running != null || paused != null) {
      final confirmed = await showAppConfirmDialog(
        context: context,
        title: paused != null
            ? l10n.taskBoardDetailFocusReplacePausedTitle
            : l10n.taskBoardDetailFocusReplaceTitle,
        message: paused != null
            ? l10n.taskBoardDetailFocusReplacePausedMessage
            : l10n.taskBoardDetailFocusReplaceMessage,
        confirmLabel: l10n.taskBoardDetailFocusReplaceConfirm,
        cancelLabel: l10n.commonCancel,
      );
      if (!confirmed || !mounted) return;
    }
    final title = timer.sessionTitle?.trim().isNotEmpty == true
        ? timer.sessionTitle!.trim()
        : timer.sessionTaskName ?? l10n.timerFocusTime;
    await _run(
      () => controller.startFocus(
        userId: userId,
        wsId: wsId,
        title: title,
        taskId: timer.sessionTaskId,
        taskName: timer.sessionTaskName,
        replacingPaused: paused,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<PomodoroController?>();
    if (controller == null) return const SizedBox.shrink();
    final state = controller.state;
    final settings = context.select<TimeTrackerCubit, PomodoroSettings>(
      (cubit) => cubit.state.pomodoroSettings,
    );
    _syncTick(state);
    final l10n = context.l10n;
    return AppPanel(
      key: const ValueKey('pomodoro-panel'),
      title: l10n.timerPomodoro,
      subtitle: state.isIdle
          ? l10n.timerPomodoroSummary(
              settings.focusMinutes,
              settings.shortBreakMinutes,
            )
          : null,
      child: state.isIdle
          ? Align(
              alignment: AlignmentDirectional.centerStart,
              child: AppButton.primary(
                key: const ValueKey('pomodoro-start'),
                leading: const Icon(LucideIcons.timer),
                onPressed: _busy ? null : () => unawaited(_start(controller)),
                child: Text(l10n.timerPomodoroStart),
              ),
            )
          : _ActivePomodoro(
              state: state,
              now: controller.now(),
              settings: settings,
              busy: _busy,
              onPause: () => unawaited(_run(controller.pause)),
              onResume: () => unawaited(_run(controller.resume)),
              onSkip: () => unawaited(_run(controller.skip)),
              onStop: () => unawaited(_run(controller.stop)),
            ),
    );
  }
}

class _ActivePomodoro extends StatelessWidget {
  const _ActivePomodoro({
    required this.state,
    required this.now,
    required this.settings,
    required this.busy,
    required this.onPause,
    required this.onResume,
    required this.onSkip,
    required this.onStop,
  });

  final PomodoroState state;
  final DateTime now;
  final PomodoroSettings settings;
  final bool busy;
  final VoidCallback onPause;
  final VoidCallback onResume;
  final VoidCallback onSkip;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final remaining = state.remainingAt(now);
    final total = Duration(
      minutes: switch (state.phase) {
        PomodoroPhase.shortBreak => settings.shortBreakMinutes,
        PomodoroPhase.longBreak => settings.longBreakMinutes,
        _ => settings.focusMinutes,
      },
    );
    final label = switch (state.phase) {
      PomodoroPhase.shortBreak => l10n.timerShortBreak,
      PomodoroPhase.longBreak => l10n.timerLongBreak,
      _ => l10n.timerFocusTime,
    };
    final minutes = remaining.inMinutes.toString().padLeft(2, '0');
    final seconds = (remaining.inSeconds % 60).toString().padLeft(2, '0');
    final cycle = (state.completedFocus % settings.sessionsUntilLongBreak) + 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Semantics(
            label: '$label, ${l10n.timerPomodoroRemaining(minutes, seconds)}',
            excludeSemantics: true,
            child: FocusTimerRing(
              progress: total.inSeconds == 0
                  ? 0
                  : 1 - remaining.inSeconds / total.inSeconds,
              color: state.isFocus
                  ? tokens.colorScheme.primary
                  : tokens.colorScheme.success,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '$minutes:$seconds',
                    key: const ValueKey('pomodoro-remaining'),
                    style: tokens.typography.x3Large.copyWith(
                      fontWeight: FontWeight.w700,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  Text(label, style: tokens.typography.small),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Text(
          [
            l10n.timerPomodoroCycle(cycle, settings.sessionsUntilLongBreak),
            if (state.taskName?.trim().isNotEmpty == true) state.taskName!,
          ].join(' · '),
          textAlign: TextAlign.center,
          style: tokens.typography.small.copyWith(
            color: tokens.colorScheme.mutedForeground,
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            if (state.isRunning)
              AppButton.primary(
                key: const ValueKey('pomodoro-pause'),
                leading: const Icon(LucideIcons.pause),
                onPressed: busy ? null : onPause,
                child: Text(l10n.timerPause),
              )
            else
              AppButton.primary(
                key: const ValueKey('pomodoro-resume'),
                leading: const Icon(LucideIcons.play),
                onPressed: busy ? null : onResume,
                child: Text(
                  state.sessionId == null && state.isFocus
                      ? l10n.timerPomodoroStart
                      : l10n.timerResume,
                ),
              ),
            AppButton.outline(
              key: const ValueKey('pomodoro-skip'),
              leading: const Icon(LucideIcons.skipForward),
              onPressed: busy ? null : onSkip,
              child: Text(l10n.timerPomodoroSkip),
            ),
            AppButton.ghost(
              key: const ValueKey('pomodoro-stop'),
              leading: const Icon(LucideIcons.square),
              onPressed: busy ? null : onStop,
              child: Text(l10n.timerStop),
            ),
          ],
        ),
      ],
    );
  }
}
