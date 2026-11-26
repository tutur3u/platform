import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/collab_failure.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/task_comments_cubit.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_collaboration_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_collaboration_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/collab_common.dart';
import 'package:mobile/l10n/l10n.dart';

/// A task's comments and the composer, as on web: Markdown bodies, and
/// edit and delete on the viewer's own comments only.
class TaskCommentsSection extends StatefulWidget {
  const TaskCommentsSection({
    required this.wsId,
    required this.taskId,
    required this.currentUserId,
    this.enabled = true,
    super.key,
  });

  final String wsId;
  final String taskId;
  final String? currentUserId;

  /// False while the board saves another change.
  final bool enabled;

  @override
  State<TaskCommentsSection> createState() => _TaskCommentsSectionState();
}

class _TaskCommentsSectionState extends State<TaskCommentsSection> {
  late final TaskCommentsCubit _cubit = TaskCommentsCubit(
    repository:
        context.read<TaskCollaborationRepository?>() ??
        TaskCollaborationRepository(),
    wsId: widget.wsId,
    taskId: widget.taskId,
  );

  @override
  void initState() {
    super.initState();
    unawaited(_cubit.load());
  }

  @override
  void dispose() {
    unawaited(_cubit.close());
    super.dispose();
  }

  Future<bool> _post(String body) async {
    final failure = await _cubit.add(body);
    if (!mounted) return false;
    showCollabResult(
      context,
      failure,
      fallback: context.l10n.taskCollabCommentFailed,
    );
    return failure == null;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocProvider.value(
      value: _cubit,
      child: BlocBuilder<TaskCommentsCubit, TaskCommentsState>(
        builder: (context, state) => CollabSection(
          title: l10n.taskCollabComments,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: AppSpacing.sm,
            children: [
              switch (state.load) {
                CollabLoad.loading => const CollabStatus.loading(),
                CollabLoad.failed => CollabStatus.failed(
                  failure: state.loadFailure ?? CollabFailure.other,
                  message: l10n.taskCollabCommentsLoadFailed,
                  onRetry: () => unawaited(_cubit.load()),
                ),
                CollabLoad.loaded when state.comments.isEmpty =>
                  CollabStatus.empty(l10n.taskCollabNoComments),
                CollabLoad.loaded => AppCard(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                  ),
                  child: Column(
                    children: [
                      for (final (index, comment) in state.comments.indexed)
                        _CommentTile(
                          key: ValueKey('task-comment-${comment.id}'),
                          comment: comment,
                          divided: index > 0,
                          mine:
                              widget.currentUserId != null &&
                              comment.author?.id == widget.currentUserId,
                          enabled:
                              widget.enabled &&
                              state.busyCommentId != comment.id,
                        ),
                    ],
                  ),
                ),
              },
              if (state.load == CollabLoad.loaded)
                _CommentComposer(
                  key: const ValueKey('task-comment-composer'),
                  submitLabel: l10n.taskCollabComment,
                  busy: state.posting,
                  enabled: widget.enabled,
                  onSubmit: _post,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CommentTile extends StatefulWidget {
  const _CommentTile({
    required this.comment,
    required this.divided,
    required this.mine,
    required this.enabled,
    super.key,
  });

  final TaskComment comment;
  final bool divided;
  final bool mine;
  final bool enabled;

  @override
  State<_CommentTile> createState() => _CommentTileState();
}

class _CommentTileState extends State<_CommentTile> {
  bool _editing = false;

  Future<bool> _save(String body) async {
    final cubit = context.read<TaskCommentsCubit>();
    final failure = await cubit.edit(widget.comment.id, body);
    if (!mounted) return false;
    showCollabResult(
      context,
      failure,
      fallback: context.l10n.taskCollabCommentFailed,
    );
    if (failure == null) setState(() => _editing = false);
    return failure == null;
  }

  Future<void> _delete() async {
    final l10n = context.l10n;
    final cubit = context.read<TaskCommentsCubit>();
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: l10n.taskCollabDeleteCommentTitle,
      message: l10n.taskCollabDeleteCommentDescription,
      confirmLabel: l10n.commonDelete,
      cancelLabel: l10n.commonCancel,
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    final failure = await cubit.delete(widget.comment.id);
    if (!mounted) return;
    showCollabResult(context, failure, fallback: l10n.taskCollabCommentFailed);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final comment = widget.comment;
    final name = collabPersonName(
      context,
      comment.author,
      external: comment.externalAuthor,
    );
    final meta = [
      if (comment.createdAt case final at?) collabTimestamp(context, at),
      if (comment.editedAt != null) l10n.taskCollabEdited,
    ].join(' · ');
    return DecoratedBox(
      decoration: BoxDecoration(
        border: widget.divided
            ? Border(top: BorderSide(color: tokens.colorScheme.border))
            : null,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: AppSpacing.xs,
          children: [
            Row(
              spacing: AppSpacing.sm,
              children: [
                CollabAvatar(name: name, avatarUrl: comment.author?.avatarUrl),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: tokens.typography.small.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (meta.isNotEmpty)
                        Text(
                          meta,
                          style: tokens.typography.xSmall.copyWith(
                            color: tokens.colorScheme.mutedForeground,
                          ),
                        ),
                    ],
                  ),
                ),
                if (widget.mine && !_editing) ...[
                  AppIconButton(
                    key: ValueKey('task-comment-edit-${comment.id}'),
                    tooltip: l10n.commonEdit,
                    icon: const Icon(LucideIcons.pencil, size: 16),
                    onPressed: widget.enabled
                        ? () => setState(() => _editing = true)
                        : null,
                  ),
                  AppIconButton(
                    key: ValueKey('task-comment-delete-${comment.id}'),
                    tooltip: l10n.commonDelete,
                    icon: const Icon(LucideIcons.trash2, size: 16),
                    onPressed: widget.enabled
                        ? () => unawaited(_delete())
                        : null,
                  ),
                ],
              ],
            ),
            if (_editing)
              _CommentComposer(
                initialValue: comment.body,
                submitLabel: l10n.commonSave,
                busy: !widget.enabled,
                enabled: true,
                autofocus: true,
                onCancel: () => setState(() => _editing = false),
                onSubmit: _save,
              )
            else
              CommentBody(body: comment.body),
          ],
        ),
      ),
    );
  }
}

/// A comment rendered as Markdown; only https links open.
class CommentBody extends StatelessWidget {
  const CommentBody({required this.body, super.key});

  final String body;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final text = tokens.typography.small.copyWith(
      color: tokens.colorScheme.foreground,
      height: 1.45,
    );
    return MarkdownBody(
      data: body,
      softLineBreak: true,
      styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
        p: text,
        listBullet: text,
        a: text.copyWith(decoration: TextDecoration.underline),
        code: text.copyWith(
          fontFamily: 'monospace',
          backgroundColor: tokens.colorScheme.muted,
        ),
      ),
      imageBuilder: (uri, title, alt) => Text(alt ?? ''),
      onTapLink: (text, href, title) {
        final uri = href == null ? null : Uri.tryParse(href);
        if (uri != null && uri.scheme == 'https') {
          unawaited(openMobileLink(context, uri));
        }
      },
    );
  }
}

class _CommentComposer extends StatefulWidget {
  const _CommentComposer({
    required this.submitLabel,
    required this.busy,
    required this.enabled,
    required this.onSubmit,
    this.initialValue = '',
    this.autofocus = false,
    this.onCancel,
    super.key,
  });

  final String submitLabel;
  final bool busy;
  final bool enabled;
  final String initialValue;
  final bool autofocus;
  final VoidCallback? onCancel;

  /// Resolves true when saved, so the draft clears; a failure keeps it.
  final Future<bool> Function(String body) onSubmit;

  @override
  State<_CommentComposer> createState() => _CommentComposerState();
}

class _CommentComposerState extends State<_CommentComposer> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.initialValue,
  )..addListener(() => setState(() {}));

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final saved = await widget.onSubmit(_controller.text);
    if (saved && mounted && widget.onCancel == null) _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final canSubmit =
        widget.enabled && !widget.busy && _controller.text.trim().isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.xs,
      children: [
        AppTextField(
          controller: _controller,
          placeholder: l10n.taskCollabCommentPlaceholder,
          minLines: 2,
          maxLines: 8,
          // The route's limit, without a counter, as on web.
          inputFormatters: [LengthLimitingTextInputFormatter(65536)],
          autofocus: widget.autofocus,
          enabled: widget.enabled && !widget.busy,
          keyboardType: TextInputType.multiline,
          textCapitalization: TextCapitalization.sentences,
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          spacing: AppSpacing.xs,
          children: [
            if (widget.onCancel case final cancel?)
              AppButton.ghost(
                size: AppButtonSize.small,
                onPressed: widget.busy ? null : cancel,
                child: Text(l10n.commonCancel),
              ),
            AppButton.primary(
              size: AppButtonSize.small,
              loading: widget.busy,
              onPressed: canSubmit ? () => unawaited(_submit()) : null,
              leading: const Icon(LucideIcons.send, size: 14),
              child: Text(widget.submitLabel),
            ),
          ],
        ),
      ],
    );
  }
}
