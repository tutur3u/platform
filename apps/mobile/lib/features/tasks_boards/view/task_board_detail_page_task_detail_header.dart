part of 'task_board_detail_page.dart';

/// The task title, edited in place. A tap turns it into a field; Done, a
/// tap outside or losing focus saves it. A pending edit also saves when
/// the surface closes, so closing never drops a typed title.
class _TaskDetailTitleField extends StatefulWidget {
  const _TaskDetailTitleField({
    required this.task,
    required this.enabled,
    required this.onRename,
  });

  final TaskBoardTask task;
  final bool enabled;
  final void Function(TaskBoardTask task, String name) onRename;

  @override
  State<_TaskDetailTitleField> createState() => _TaskDetailTitleFieldState();
}

class _TaskDetailTitleFieldState extends State<_TaskDetailTitleField> {
  late final TextEditingController _controller = TextEditingController(
    text: _savedTitle,
  );
  final FocusNode _focusNode = FocusNode(debugLabel: 'task-detail-title');
  bool _editing = false;

  String get _savedTitle => widget.task.name?.trim() ?? '';

  bool get _dirty {
    final next = _controller.text.trim();
    return _editing && next.isNotEmpty && next != _savedTitle;
  }

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(_handleFocusChange);
  }

  @override
  void didUpdateWidget(covariant _TaskDetailTitleField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_editing && oldWidget.task.name != widget.task.name) {
      _controller.text = _savedTitle;
    }
  }

  @override
  void dispose() {
    if (_dirty) widget.onRename(widget.task, _controller.text.trim());
    _focusNode
      ..removeListener(_handleFocusChange)
      ..dispose();
    _controller.dispose();
    super.dispose();
  }

  void _handleFocusChange() {
    if (!_focusNode.hasFocus && _editing) _commit();
  }

  void _startEditing() {
    if (!widget.enabled) return;
    setState(() {
      _editing = true;
      _controller
        ..text = _savedTitle
        ..selection = TextSelection.collapsed(offset: _savedTitle.length);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focusNode.requestFocus();
    });
  }

  void _commit() {
    if (!_editing) return;
    if (_dirty) widget.onRename(widget.task, _controller.text.trim());
    setState(() => _editing = false);
    _focusNode.unfocus();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final style = tokens.typography.xLarge.copyWith(
      color: c.foreground,
      fontWeight: FontWeight.w700,
      height: 1.25,
    );
    if (_editing) {
      return AppTextField(
        key: const ValueKey('task-detail-title-field'),
        controller: _controller,
        focusNode: _focusNode,
        borderless: true,
        style: style,
        maxLines: null,
        contentPadding: EdgeInsets.zero,
        textInputAction: TextInputAction.done,
        textCapitalization: TextCapitalization.sentences,
        placeholder: l10n.taskBoardDetailTaskTitleHint,
        onSubmitted: (_) => _commit(),
        onTapOutside: (_) => _commit(),
      );
    }
    final title = _savedTitle.isEmpty
        ? l10n.taskBoardDetailUntitledTask
        : _savedTitle;
    return Semantics(
      button: widget.enabled,
      hint: l10n.taskDetailEditTitle,
      child: GestureDetector(
        key: const ValueKey('task-detail-title'),
        behavior: HitTestBehavior.opaque,
        onTap: widget.enabled ? _startEditing : null,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44),
          child: Align(
            alignment: AlignmentDirectional.centerStart,
            child: Text(title, style: style),
          ),
        ),
      ),
    );
  }
}

enum _TaskDetailMenuAction { focus, delete }

/// The detail surface's More menu: focus, then delete, last and
/// destructive.
class _TaskDetailMoreButton extends StatelessWidget {
  const _TaskDetailMoreButton({
    required this.task,
    required this.enabled,
    required this.actions,
  });

  final TaskBoardTask task;
  final bool enabled;
  final _TaskDetailActions actions;

  Future<void> _open(BuildContext context) async {
    final l10n = context.l10n;
    final action = await showAppActionSheet<_TaskDetailMenuAction>(
      context: context,
      title: task.name?.trim().isNotEmpty == true
          ? task.name!.trim()
          : l10n.taskBoardDetailUntitledTask,
      actions: [
        if (actions.onFocus != null)
          AppSheetAction(
            value: _TaskDetailMenuAction.focus,
            icon: LucideIcons.timer,
            tone: AppTone.primary,
            label: l10n.taskBoardDetailStartFocus,
          ),
        AppSheetAction(
          key: const ValueKey('task-detail-menu-delete'),
          value: _TaskDetailMenuAction.delete,
          icon: LucideIcons.trash2,
          destructive: true,
          label: l10n.taskBoardDetailDeleteTask,
        ),
      ],
    );
    switch (action) {
      case _TaskDetailMenuAction.focus:
        actions.onFocus?.call(task);
      case _TaskDetailMenuAction.delete:
        actions.onDelete(task);
      case null:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppIconButton(
      key: const ValueKey('task-detail-more'),
      tooltip: context.l10n.commonMoreOptions,
      icon: const Icon(LucideIcons.ellipsis, size: 18),
      onPressed: enabled ? () => unawaited(_open(context)) : null,
    );
  }
}
