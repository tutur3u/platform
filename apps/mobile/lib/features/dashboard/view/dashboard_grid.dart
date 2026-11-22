part of 'dashboard_page.dart';

/// Home's type and spacing steps for the width its content box receives
/// (after the shell rail, gutters and max width), so a laptop beside the
/// sidebar and a tablet without one each get the step that fits.
@immutable
class _HomeScale {
  const _HomeScale._({
    required this.greetingSize,
    required this.dateSize,
    required this.metricSize,
    required this.gap,
    required this.strip,
  });

  factory _HomeScale.forWidth(double width) => switch (width) {
    // Laptops and desktops: three or four columns.
    >= 1000 => const _HomeScale._(
      greetingSize: 34,
      dateSize: 15,
      metricSize: 36,
      gap: AppSpacing.xxl + AppSpacing.xs,
      strip: true,
    ),
    // Landscape and portrait tablets: two or three columns.
    >= 560 => const _HomeScale._(
      greetingSize: 30,
      dateSize: 15,
      metricSize: 32,
      gap: AppLayout.sectionGap,
      strip: true,
    ),
    // Phones: one column, the summary stays a card in the user's order.
    _ => const _HomeScale._(
      greetingSize: 24,
      dateSize: 14,
      metricSize: 30,
      gap: AppLayout.sectionGap,
      strip: false,
    ),
  };

  final double greetingSize;
  final double dateSize;
  final double metricSize;

  /// Gap between grid columns and between cards in a column.
  final double gap;

  /// Whether Today at a glance leaves the grid for a KPI strip under the
  /// greeting.
  final bool strip;

  /// Narrowest grid column; a 13-inch laptop and a landscape iPad fit three.
  static const double minColumnWidth = 320;

  /// Widest grid: four columns on wide desktops (root pages cap at 1600dp).
  static const int maxColumns = 4;
}

/// Hands the [_HomeScale] the grid resolved to the header and the summary,
/// which are built before the width is known.
class _HomeScaleScope extends InheritedWidget {
  const _HomeScaleScope({required this.scale, required super.child});

  final _HomeScale scale;

  static _HomeScale of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_HomeScaleScope>()?.scale ??
      _HomeScale.forWidth(0);

  @override
  bool updateShouldNotify(_HomeScaleScope oldWidget) =>
      scale != oldWidget.scale;
}

extension _DashboardGrid on _DashboardViewState {
  /// Lays out [entries] for one width step. Builds no cubit-watching
  /// widgets itself, so it can run inside a layout builder.
  Widget _homeGrid(
    _HomeScale scale,
    Workspace workspace,
    List<({String id, Widget child})> entries,
  ) {
    final summary = scale.strip
        ? entries.where((entry) => entry.id == 'summary').firstOrNull
        : null;
    return _HomeScaleScope(
      scale: scale,
      child: SliverResponsiveCards(
        minColumnWidth: _HomeScale.minColumnWidth,
        maxColumns: _HomeScale.maxColumns,
        spacing: scale.gap,
        leading: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            StaggeredEntrance(
              replayKey: widget.replayToken,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const _HomeHeader(),
                  HomeLastSynced(wsId: workspace.id),
                ],
              ),
            ),
            if (summary != null) ...[
              SizedBox(height: scale.gap),
              summary.child,
            ],
          ],
        ),
        children: [
          for (final entry in entries)
            // Records have no identity; the strip moved the summary by id.
            if (summary == null || entry.id != summary.id) entry.child,
        ],
      ),
    );
  }

  Future<void> _retryTasks(BuildContext context, Workspace workspace) =>
      context.read<TaskListCubit>().loadTasks(
        wsId: workspace.id,
        isPersonal: workspace.personal,
        forceRefresh: true,
        userId: context.read<AuthCubit>().state.user?.id,
      );

  Future<void> _retryEvents(BuildContext context, Workspace workspace) =>
      context.read<CalendarCubit>().loadEvents(
        workspace.id,
        forceRefresh: true,
      );
}
