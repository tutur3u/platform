part of 'task_link_picker_sheet.dart';

extension on _TaskLinkPickerSheetState {
  Widget _buildTaskList(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    if (_loadMode == _TaskLinkLoadMode.cold && _tasks.isEmpty) {
      return const AppLoadingIndicator.page();
    }

    if (_errorMessage != null && _tasks.isEmpty) {
      return NovaRefreshIndicator.state(
        onRefresh: () => _loadInitial(refresh: true),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.error_outline,
                  size: 24,
                  color: theme.colorScheme.destructive,
                ),
                const shad.Gap(8),
                Text(
                  _errorMessage ?? l10n.commonSomethingWentWrong,
                  textAlign: TextAlign.center,
                ),
                const shad.Gap(10),
                shad.SecondaryButton(
                  onPressed: () => unawaited(_loadInitial()),
                  child: Text(l10n.commonRetry),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (_tasks.isEmpty) {
      return NovaRefreshIndicator.state(
        onRefresh: () => _loadInitial(refresh: true),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Text(
              l10n.timerTaskPickerNoMatchingTasks,
              textAlign: TextAlign.center,
              style: theme.typography.textMuted,
            ),
          ),
        ),
      );
    }

    final itemCount = _tasks.length + (_isLoadingMore ? 1 : 0);
    return NovaRefreshIndicator(
      onRefresh: () => _loadInitial(refresh: true),
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        controller: _scrollController,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        itemCount: itemCount,
        separatorBuilder: (_, _) => const shad.Gap(8),
        itemBuilder: (context, index) {
          if (index >= _tasks.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 10),
              child: Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: NovaLoadingIndicator(size: 20),
                ),
              ),
            );
          }

          final task = _tasks[index];
          final selected = task.id == widget.selectedTaskId;
          return _TaskOptionCard(
            task: task,
            selected: selected,
            onTap: () => unawaited(_selectTask(context, task)),
          );
        },
      ),
    );
  }
}
