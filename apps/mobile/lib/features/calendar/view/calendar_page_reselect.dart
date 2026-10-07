part of 'calendar_page.dart';

extension _CalendarPageReselect on _CalendarViewState {
  ShellMiniNavItemSpec _buildMiniNavItem(
    BuildContext context, {
    required String id,
    required String label,
    required IconData icon,
    required bool selected,
    required CalendarViewMode mode,
  }) {
    return ShellMiniNavItemSpec(
      id: id,
      icon: icon,
      label: label,
      selected: selected,
      callbackToken: '$id-${selected ? 'selected-' : ''}${mode.name}',
      onReselect: () => _resetCurrentCalendarView(context),
      onPressed: () {
        if (!mounted || !context.mounted) return;
        final cubit = context.read<CalendarCubit>();
        unawaited(cubit.setViewMode(mode));
        final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
        if (wsId != null) {
          unawaited(
            cubit.ensureRangeLoaded(wsId, cubit.state.effectiveSelectedDate),
          );
        }
      },
    );
  }

  void _resetCurrentCalendarView(BuildContext context) {
    if (!mounted || !context.mounted) return;
    final cubit = context.read<CalendarCubit>();
    if (cubit.isClosed) return;
    // Capture the projected wall clock once for selection and loading.
    final now = calendarNowInContext(context);
    cubit.selectDate(now);
    _advanceResetGeneration();
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId != null && wsId.isNotEmpty) {
      unawaited(
        cubit.ensureRangeLoaded(wsId, cubit.state.effectiveSelectedDate),
      );
    }
  }
}
