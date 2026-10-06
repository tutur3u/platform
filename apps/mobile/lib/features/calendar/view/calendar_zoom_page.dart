part of 'calendar_page.dart';

extension _CalendarZoomPage on _CalendarViewState {
  ValueChanged<double> _zoomHandler(BuildContext context) {
    final cubit = context.read<CalendarCubit>();
    final actor = currentCacheUserId();
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    final scope = cubit.timelineZoomScope;
    return (zoom) => unawaited(
      cubit.setTimelineZoom(
        zoom,
        expectedUserId: actor,
        expectedWorkspaceId: workspace,
        expectedScope: scope,
      ),
    );
  }
}
