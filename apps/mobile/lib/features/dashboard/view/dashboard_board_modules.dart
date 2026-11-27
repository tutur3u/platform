part of 'dashboard_page.dart';

class _HomeQuickCapture extends StatelessWidget {
  const _HomeQuickCapture({required this.workspace});

  final Workspace workspace;

  Future<void> _open(BuildContext context, String actor) async {
    final auth = context.read<AuthCubit>();
    final workspaces = context.read<WorkspaceCubit>();
    bool isCurrentScope() =>
        context.mounted &&
        auth.state.status == AuthStatus.authenticated &&
        auth.state.user?.id == actor &&
        workspaces.state.currentWorkspace?.id == workspace.id;

    if (!isCurrentScope()) return;
    final preferences = context.read<TimezoneSettingsCubit?>()?.state;
    final cubit = context.read<TaskListCubit>();
    final now = HomeWallClock.of(context);
    final added = await showAppSheet<bool>(
      context: context,
      size: AppSheetSize.large,
      useRootNavigator: true,
      builder: (_) => MyTaskQuickAddSheet(
        repository: TaskRepository(),
        cubit: cubit,
        workspaceId: workspace.id,
        isCurrentScope: isCurrentScope,
        now: now,
        zone: preferences?.resolved == true ? preferences!.effective : null,
      ),
    );
    if (added == true && context.mounted && isCurrentScope()) {
      showAppToast(context, message: context.l10n.taskBoardDetailTaskCreated);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthCubit>().state;
    final actor = auth.user?.id;
    if (actor == null || auth.status != AuthStatus.authenticated) {
      return const SizedBox.shrink();
    }
    return AppButton.primary(
      key: const ValueKey('home-quick-capture'),
      leading: const Icon(LucideIcons.plus),
      onPressed: () => unawaited(_open(context, actor)),
      child: Text(context.l10n.tasksCreate),
    );
  }
}

class _HomeMiraCard extends StatelessWidget {
  const _HomeMiraCard();

  @override
  Widget build(BuildContext context) => AppGroupedCard(
    children: [
      AppGroupedRow(
        leading: const Icon(LucideIcons.sparkles),
        title: Text(context.l10n.navMira),
        onTap: () => context.go(Routes.mira),
      ),
    ],
  );
}

List<AppModule> _visibleHomePins(BuildContext context) {
  final tabs = context.watch<AppTabCubit?>();
  if (tabs == null || tabs.state.pinnedAppIds.isEmpty) return const [];
  final available = {
    for (final app in AppRegistry.modules(context))
      if (!tabs.state.hiddenAppIds.contains(app.id)) app.id: app,
  };
  return tabs.state.pinnedAppIds.map((id) => available[id]).nonNulls.toList();
}

class _HomePinnedApps extends StatelessWidget {
  const _HomePinnedApps({required this.pins});

  final List<AppModule> pins;

  @override
  Widget build(BuildContext context) => AppLauncherPins(
    title: context.l10n.appsPinnedSection,
    apps: pins,
    onSelected: (app) {
      if (!_visibleHomePinsForLaunch(context, app.id)) return;
      unawaited(context.read<AppTabCubit>().select(app));
      context.go(app.route);
    },
    onManage: () => context.go(Routes.apps),
  );

  bool _visibleHomePinsForLaunch(BuildContext context, String id) {
    final state = context.read<AppTabCubit>().state;
    return state.pinnedAppIds.contains(id) && !state.hiddenAppIds.contains(id);
  }
}
