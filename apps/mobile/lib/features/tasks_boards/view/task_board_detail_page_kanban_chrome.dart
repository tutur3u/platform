part of 'task_board_detail_page.dart';

class _KanbanColumnHeader extends StatelessWidget {
  const _KanbanColumnHeader({
    required this.list,
    required this.count,
    required this.collapsed,
    required this.onToggle,
    required this.onCreate,
    required this.onEdit,
  });

  final TaskBoardList list;
  final int count;
  final bool? collapsed;
  final VoidCallback? onToggle;
  final VoidCallback onCreate;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final style = _taskBoardListVisualStyle(context, list);
    final name = list.name?.trim();
    return Padding(
      padding: const EdgeInsetsDirectional.only(
        start: AppSpacing.md,
        end: AppSpacing.xs,
      ),
      child: Row(
        children: [
          Icon(style.statusIcon, size: 17, color: style.accent),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Semantics(
              header: true,
              child: Text(
                name == null || name.isEmpty
                    ? l10n.taskBoardDetailUntitledList
                    : name,
                style: tokens.typography.body.copyWith(
                  fontWeight: FontWeight.w700,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.xs),
          TaskMetadataChip(
            label: MaterialLocalizations.of(context).formatDecimal(count),
          ),
          if (collapsed case final value?)
            AppIconButton(
              tooltip: value
                  ? l10n.taskBoardDetailExpandList
                  : l10n.taskBoardDetailCollapseList,
              icon: Icon(
                value ? LucideIcons.chevronDown : LucideIcons.chevronUp,
                size: 16,
              ),
              onPressed: onToggle,
            ),
          AppIconButton(
            key: ValueKey('kanban-add-${list.id}'),
            tooltip: l10n.taskBoardDetailCreateTask,
            icon: const Icon(LucideIcons.plus, size: 18),
            onPressed: onCreate,
          ),
          AppIconButton(
            tooltip: l10n.taskBoardDetailEditList,
            icon: const Icon(LucideIcons.ellipsis, size: 18),
            onPressed: onEdit,
          ),
        ],
      ),
    );
  }
}

class _KanbanInsertionLine extends StatelessWidget {
  const _KanbanInsertionLine();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: AppSpacing.xs),
    child: Divider(
      height: 3,
      thickness: 3,
      color: AppTokens.of(context).colorScheme.primary,
    ),
  );
}

class _KanbanTaskCover extends StatefulWidget {
  const _KanbanTaskCover({
    required this.description,
    required this.workspaceId,
  });

  final String description;
  final String workspaceId;

  @override
  State<_KanbanTaskCover> createState() => _KanbanTaskCoverState();
}

class _KanbanTaskCoverState extends State<_KanbanTaskCover> {
  String? _url;

  @override
  void initState() {
    super.initState();
    _resolveCover();
  }

  @override
  void didUpdateWidget(covariant _KanbanTaskCover oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.description != widget.description ||
        oldWidget.workspaceId != widget.workspaceId) {
      _resolveCover();
    }
  }

  void _resolveCover() {
    final root = decodeTipTapDescription(widget.description).document;
    final nodes = <Object?>[root];
    _url = null;
    while (nodes.isNotEmpty) {
      final node = nodes.removeLast();
      if (node is! Map) continue;
      if (node['attrs'] case {
        'src': final String source,
      } when node['type'] == 'image' || node['type'] == 'imageResize') {
        final uri = Uri.tryParse(resolveTaskDescriptionUrl(source.trim()));
        final segments = uri?.pathSegments;
        // A thumbnail automatically loads only workspace-owned attachments.
        if (uri != null &&
            isTrustedTaskDescriptionUrl(uri.toString()) &&
            segments != null &&
            segments.length == 6 &&
            segments[0] == 'api' &&
            segments[1] == 'v1' &&
            segments[2] == 'workspaces' &&
            segments[3] == widget.workspaceId &&
            segments[4] == 'storage' &&
            segments[5] == 'share' &&
            uri.queryParameters['path']?.startsWith(
                  '${widget.workspaceId}/task-images/',
                ) ==
                true) {
          _url = uri.toString();
          return;
        }
      }
      if (node['content'] case final List<Object?> children) {
        nodes.addAll(children.reversed);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final url = _url;
    if (url == null) return const SizedBox.shrink();
    return SizedBox(
      height: 104,
      child: Image.network(
        url,
        headers: trustedAuthHeadersForUrl(url),
        cacheWidth: (360 * MediaQuery.devicePixelRatioOf(context)).round(),
        fit: BoxFit.cover,
        excludeFromSemantics: true,
        errorBuilder: (_, _, _) =>
            ColoredBox(color: AppTokens.of(context).colorScheme.muted),
      ),
    );
  }
}
