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
    this.desktop = false,
  });

  factory _HomeScale.forWidth(double width, {bool desktop = false}) => switch ((
    desktop,
    width,
  )) {
    (true, _) => _HomeScale._(
      greetingSize: 36,
      dateSize: 16,
      metricSize: 40,
      gap: AppLayout.sectionGap * AppLayout.spacingScale(DeviceClass.expanded),
      strip: true,
      desktop: true,
    ),
    (_, >= 1000) => const _HomeScale._(
      greetingSize: 34,
      dateSize: 15,
      metricSize: 36,
      gap: AppSpacing.xxl + AppSpacing.xs,
      strip: true,
    ),
    (_, >= 560) => const _HomeScale._(
      greetingSize: 30,
      dateSize: 15,
      metricSize: 32,
      gap: AppLayout.sectionGap,
      strip: true,
    ),
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
  final bool desktop;

  /// Gap between grid columns and between cards in a column.
  final double gap;

  /// Whether Today at a glance leaves the grid for a KPI strip under the
  /// greeting.
  final bool strip;

  /// Minimum column width for the content-sized phone and tablet layout.
  /// Two columns fit beside the 80dp rail on a 768dp portrait tablet: a
  /// 688dp body leaves 640dp inside 24dp gutters, split by a 24dp gap.
  static const double minColumnWidth = 308;

  /// Widest grid: four columns on large laptop and desktop windows.
  static const int maxColumns = 4;

  double spacing(double base) =>
      base *
      AppLayout.spacingScale(
        desktop ? DeviceClass.expanded : DeviceClass.compact,
      );
}

/// Hands the [_HomeScale] the grid resolved to the header and the summary,
/// which are built before the width is known.
class _HomeScaleScope extends InheritedWidget {
  const _HomeScaleScope({
    required this.scale,
    required super.child,
    this.minCardHeight = 0,
  });

  final _HomeScale scale;
  final double minCardHeight;

  static _HomeScale of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_HomeScaleScope>()?.scale ??
      _HomeScale.forWidth(0);

  static double cardHeightOf(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<_HomeScaleScope>()
          ?.minCardHeight ??
      0;

  @override
  bool updateShouldNotify(_HomeScaleScope oldWidget) =>
      scale != oldWidget.scale || minCardHeight != oldWidget.minCardHeight;
}

extension _DashboardGrid on _DashboardViewState {
  /// Lays out [entries] for one width step. Builds no cubit-watching
  /// widgets itself, so it can run inside a layout builder.
  Widget _homeGrid(
    _HomeScale scale,
    Workspace workspace,
    List<({String id, Widget child})> entries, {
    required double bottomInset,
    required bool customOrder,
    required List<AppModule> pins,
    required bool showFocus,
  }) {
    final summary = entries.where((entry) => entry.id == 'summary').firstOrNull;
    final leading = Column(
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
        SizedBox(height: scale.gap),
        _HomeQuickCapture(workspace: workspace),
        if (summary != null) ...[SizedBox(height: scale.gap), summary.child],
        if (summary != null && showFocus)
          ProfileFocusTimeSection(
            key: _focusKey,
            replayToken: widget.replayToken,
            compact: true,
          ),
      ],
    );
    final phoneDefault = !scale.strip && !customOrder;
    final sections = [
      for (final entry in entries)
        if (entry.id != summary?.id &&
            (!phoneDefault || entry.id != 'activity'))
          entry.child,
      if (phoneDefault)
        ...entries
            .where((entry) => entry.id == 'activity')
            .map((entry) => entry.child),
      if (pins.isNotEmpty) _HomePinnedApps(pins: pins),
    ];
    return _HomeScaleScope(
      scale: scale,
      child: scale.desktop
          ? _DesktopHomeGrid(
              scale: scale,
              leading: leading,
              sections: sections,
              bottomInset: bottomInset,
            )
          : SliverResponsiveCards(
              minColumnWidth: _HomeScale.minColumnWidth,
              maxColumns: _HomeScale.maxColumns,
              spacing: scale.gap,
              leading: leading,
              children: sections,
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

class _DesktopHomeGrid extends StatelessWidget {
  const _DesktopHomeGrid({
    required this.scale,
    required this.leading,
    required this.sections,
    required this.bottomInset,
  });

  final _HomeScale scale;
  final Widget leading;
  final List<Widget> sections;
  final double bottomInset;

  @override
  Widget build(BuildContext context) {
    final text = MediaQuery.textScalerOf(context);
    final minTileWidth = math.max<double>(260, text.scale(14) * 16);
    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(child: leading),
        if (sections.isNotEmpty) ...[
          SliverToBoxAdapter(child: SizedBox(height: scale.gap)),
          SliverLayoutBuilder(
            builder: (context, constraints) {
              final columns = AppAdaptiveGrid.columnsFor(
                constraints.crossAxisExtent,
                minTileWidth: minTileWidth,
                spacing: scale.gap,
              );
              // Fit the first two rows into the initial viewport. Natural
              // content height can stretch a card and continue scrolling.
              final rows = (sections.length / columns).ceil().clamp(1, 2);
              final remaining =
                  constraints.viewportMainAxisExtent -
                  constraints.precedingScrollExtent -
                  bottomInset -
                  scale.gap * (rows - 1);
              final cardHeight = (remaining / rows - _HomeSection.captionHeight)
                  .clamp(0.0, 720.0);
              return SliverToBoxAdapter(
                child: _HomeScaleScope(
                  scale: scale,
                  minCardHeight: cardHeight,
                  child: AppAdaptiveGrid(
                    minTileWidth: minTileWidth,
                    spacing: scale.gap,
                    runSpacing: scale.gap,
                    children: sections,
                  ),
                ),
              );
            },
          ),
        ],
      ],
    );
  }
}
