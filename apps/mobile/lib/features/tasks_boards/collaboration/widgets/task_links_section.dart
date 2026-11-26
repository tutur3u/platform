import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/collab_failure.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/task_links_cubit.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_collaboration_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_collaboration_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/collab_common.dart';
import 'package:mobile/l10n/l10n.dart';

/// A task's linked resources grouped by kind, as on web, with an https
/// field to add one and remove on each link that has its own row.
class TaskLinksSection extends StatefulWidget {
  const TaskLinksSection({
    required this.wsId,
    required this.taskId,
    this.enabled = true,
    super.key,
  });

  final String wsId;
  final String taskId;
  final bool enabled;

  @override
  State<TaskLinksSection> createState() => _TaskLinksSectionState();
}

class _TaskLinksSectionState extends State<TaskLinksSection> {
  late final TaskLinksCubit _cubit = TaskLinksCubit(
    repository:
        context.read<TaskCollaborationRepository?>() ??
        TaskCollaborationRepository(),
    wsId: widget.wsId,
    taskId: widget.taskId,
  );
  final _url = TextEditingController();
  bool _adding = false;

  @override
  void initState() {
    super.initState();
    _url.addListener(() => setState(() {}));
    unawaited(_cubit.load());
  }

  @override
  void dispose() {
    _url.dispose();
    unawaited(_cubit.close());
    super.dispose();
  }

  Future<void> _add() async {
    final l10n = context.l10n;
    final failure = await _cubit.add(_url.text);
    if (!mounted) return;
    showCollabResult(
      context,
      failure,
      fallback: failure == CollabFailure.invalid
          ? l10n.taskCollabLinkUrlInvalid
          : l10n.taskCollabLinkFailed,
    );
    if (failure == null) {
      _url.clear();
      setState(() => _adding = false);
    }
  }

  Future<void> _remove(TaskLink link) async {
    final failure = await _cubit.remove(link);
    if (!mounted) return;
    showCollabResult(
      context,
      failure,
      fallback: context.l10n.taskCollabLinkFailed,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocProvider.value(
      value: _cubit,
      child: BlocBuilder<TaskLinksCubit, TaskLinksState>(
        builder: (context, state) {
          final typed = _url.text.trim();
          final invalid = typed.isNotEmpty && !isHttpsLink(typed);
          return CollabSection(
            title: l10n.taskCollabLinkedResources,
            trailing: state.load == CollabLoad.loaded && !_adding
                ? AppButton.ghost(
                    key: const ValueKey('task-link-add'),
                    size: AppButtonSize.small,
                    onPressed: widget.enabled
                        ? () => setState(() => _adding = true)
                        : null,
                    leading: const Icon(LucideIcons.plus, size: 14),
                    child: Text(l10n.taskCollabAddLink),
                  )
                : null,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: AppSpacing.sm,
              children: [
                if (_adding)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: AppSpacing.xs,
                    children: [
                      Expanded(
                        child: AppTextField(
                          key: const ValueKey('task-link-url'),
                          controller: _url,
                          autofocus: true,
                          placeholder: l10n.taskCollabLinkUrlPlaceholder,
                          errorText: invalid
                              ? l10n.taskCollabLinkUrlInvalid
                              : null,
                          keyboardType: TextInputType.url,
                          textInputAction: TextInputAction.done,
                          autocorrect: false,
                          onSubmitted: (_) => unawaited(_add()),
                        ),
                      ),
                      AppButton.primary(
                        size: AppButtonSize.small,
                        loading: state.adding,
                        onPressed: isHttpsLink(typed) && !state.adding
                            ? () => unawaited(_add())
                            : null,
                        child: Text(l10n.taskCollabAdd),
                      ),
                      AppIconButton(
                        tooltip: l10n.commonCancel,
                        icon: const Icon(LucideIcons.x, size: 16),
                        onPressed: state.adding
                            ? null
                            : () => setState(() {
                                _adding = false;
                                _url.clear();
                              }),
                      ),
                    ],
                  ),
                switch (state.load) {
                  CollabLoad.loading => const CollabStatus.loading(),
                  CollabLoad.failed => CollabStatus.failed(
                    failure: state.loadFailure ?? CollabFailure.other,
                    message: l10n.taskCollabLinksLoadFailed,
                    onRetry: () => unawaited(_cubit.load()),
                  ),
                  CollabLoad.loaded when state.links.isEmpty =>
                    CollabStatus.empty(l10n.taskCollabNoLinks),
                  CollabLoad.loaded => Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    spacing: AppSpacing.sm,
                    children: [
                      for (final (kind, links) in state.groups)
                        _LinkGroup(
                          kind: kind,
                          links: links,
                          removingId: state.removingId,
                          enabled: widget.enabled,
                          onRemove: (link) => unawaited(_remove(link)),
                        ),
                    ],
                  ),
                },
              ],
            ),
          );
        },
      ),
    );
  }
}

class _LinkGroup extends StatelessWidget {
  const _LinkGroup({
    required this.kind,
    required this.links,
    required this.removingId,
    required this.enabled,
    required this.onRemove,
  });

  final TaskLinkKind kind;
  final List<TaskLink> links;
  final String? removingId;
  final bool enabled;
  final ValueChanged<TaskLink> onRemove;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(
            left: AppSpacing.xs,
            bottom: AppSpacing.xxs,
          ),
          child: Text(
            l10n.taskCollabLinkKind(kind.name),
            style: tokens.typography.xSmall.copyWith(
              color: tokens.colorScheme.mutedForeground,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        AppGroupedCard(
          children: [
            for (final link in links)
              AppGroupedRow(
                key: ValueKey('task-link-${link.id ?? link.url}'),
                leading: AppIconTile(icon: _kindIcon(link.kind)),
                title: Text(
                  link.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: link.legacy
                    ? Text(l10n.taskCollabLegacyLinkHint)
                    : null,
                onTap: _opener(context, link.url),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  spacing: AppSpacing.xs,
                  children: [
                    if (link.state case final state?)
                      AppBadge(
                        variant: _stateVariant(state),
                        child: Text(l10n.taskCollabLinkState(state.name)),
                      ),
                    if (link.removable)
                      AppIconButton(
                        key: ValueKey('task-link-remove-${link.id}'),
                        tooltip: l10n.taskCollabRemoveLink,
                        icon: const Icon(LucideIcons.x, size: 16),
                        onPressed: enabled && removingId == null
                            ? () => onRemove(link)
                            : null,
                      ),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// Opens [url] only when it is an https address.
VoidCallback? _opener(BuildContext context, String url) {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) return null;
  return () => unawaited(openMobileLink(context, uri));
}

IconData _kindIcon(TaskLinkKind kind) => switch (kind) {
  TaskLinkKind.pullRequest => LucideIcons.gitPullRequest,
  TaskLinkKind.commit => LucideIcons.gitCommitHorizontal,
  TaskLinkKind.ciRun => LucideIcons.workflow,
  TaskLinkKind.issue => LucideIcons.circleDot,
  TaskLinkKind.doc => LucideIcons.fileText,
  TaskLinkKind.url => LucideIcons.link,
};

/// Semantic tones; every state also carries its label.
AppBadgeVariant _stateVariant(TaskLinkState state) => switch (state) {
  TaskLinkState.open || TaskLinkState.success => AppBadgeVariant.success,
  TaskLinkState.merged => AppBadgeVariant.primary,
  TaskLinkState.closed || TaskLinkState.failure => AppBadgeVariant.destructive,
  TaskLinkState.pending => AppBadgeVariant.warning,
  TaskLinkState.draft || TaskLinkState.cancelled => AppBadgeVariant.outline,
};
