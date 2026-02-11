import 'dart:async';

import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, OutlinedButton, TextField;
import 'package:mobile/data/models/time_tracking/request_comment.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class CommentsSection extends StatelessWidget {
  const CommentsSection({
    required this.comments,
    required this.commentController,
    required this.isAddingComment,
    required this.currentUserId,
    required this.onAddComment,
    required this.onEditComment,
    required this.onDeleteComment,
    required this.canAddComments,
    super.key,
  });

  final List<TimeTrackingRequestComment> comments;
  final TextEditingController commentController;
  final bool isAddingComment;
  final String? currentUserId;
  final VoidCallback onAddComment;
  final Future<void> Function(
    TimeTrackingRequestComment comment,
    String content,
  )
  onEditComment;
  final Future<void> Function(TimeTrackingRequestComment comment)
  onDeleteComment;
  final bool canAddComments;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (comments.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Text(
              l10n.timerRequestNoComments,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
              textAlign: TextAlign.center,
            ),
          )
        else
          ...comments.map(
            (comment) => _CommentTile(
              comment: comment,
              currentUserId: currentUserId,
              onEditComment: onEditComment,
              onDeleteComment: onDeleteComment,
            ),
          ),
        if (canAddComments) ...[
          const shad.Gap(16),
          shad.TextField(
            controller: commentController,
            placeholder: Text(l10n.timerRequestAddComment),
            maxLines: 3,
            enabled: !isAddingComment,
          ),
          const shad.Gap(8),
          Align(
            alignment: Alignment.centerRight,
            child: shad.PrimaryButton(
              onPressed: isAddingComment ? null : onAddComment,
              child: isAddingComment
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: shad.CircularProgressIndicator(),
                    )
                  : Text(l10n.timerRequestPostComment),
            ),
          ),
        ],
      ],
    );
  }
}

class _CommentTile extends StatefulWidget {
  const _CommentTile({
    required this.comment,
    required this.currentUserId,
    required this.onEditComment,
    required this.onDeleteComment,
  });

  final TimeTrackingRequestComment comment;
  final String? currentUserId;
  final Future<void> Function(
    TimeTrackingRequestComment comment,
    String content,
  )
  onEditComment;
  final Future<void> Function(TimeTrackingRequestComment comment)
  onDeleteComment;

  @override
  State<_CommentTile> createState() => _CommentTileState();
}

class _CommentTileState extends State<_CommentTile> {
  late final TextEditingController _editController;
  bool _isEditing = false;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _editController = TextEditingController(text: widget.comment.content ?? '');
  }

  @override
  void dispose() {
    _editController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;
    final canEditDelete = widget.comment.canEditOrDelete(widget.currentUserId);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: theme.colorScheme.muted.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    widget.comment.userDisplayName ?? 'User',
                    style: theme.typography.small.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                if (canEditDelete)
                  Row(
                    children: [
                      shad.GhostButton(
                        density: shad.ButtonDensity.icon,
                        onPressed: _isSubmitting
                            ? null
                            : () => setState(() => _isEditing = !_isEditing),
                        child: const Icon(Icons.edit, size: 14),
                      ),
                      shad.GhostButton(
                        density: shad.ButtonDensity.icon,
                        onPressed: _isSubmitting ? null : _confirmDelete,
                        child: const Icon(Icons.delete_outline, size: 14),
                      ),
                    ],
                  ),
              ],
            ),
            const shad.Gap(4),
            if (_isEditing) ...[
              shad.TextField(
                controller: _editController,
                maxLines: 3,
                enabled: !_isSubmitting,
              ),
              const shad.Gap(8),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  shad.OutlineButton(
                    onPressed: _isSubmitting
                        ? null
                        : () {
                            setState(() {
                              _isEditing = false;
                              _editController.text =
                                  widget.comment.content ?? '';
                            });
                          },
                    child: Text(l10n.timerRequestCancelEditComment),
                  ),
                  const shad.Gap(8),
                  shad.PrimaryButton(
                    onPressed: _isSubmitting ? null : _saveEdit,
                    child: _isSubmitting
                        ? const shad.CircularProgressIndicator()
                        : Text(l10n.timerSave),
                  ),
                ],
              ),
            ] else
              Text(widget.comment.content ?? '', style: theme.typography.small),
            if (widget.comment.createdAt != null) ...[
              const shad.Gap(4),
              Text(
                _formatDateTime(widget.comment.createdAt!),
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                  fontSize: 11,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _saveEdit() async {
    final content = _editController.text.trim();
    if (content.isEmpty) {
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      await widget.onEditComment(widget.comment, content);
      if (!mounted) {
        return;
      }
      setState(() {
        _isSubmitting = false;
        _isEditing = false;
      });
    } on Exception {
      if (!mounted) {
        return;
      }
      setState(() => _isSubmitting = false);
    }
  }

  Future<void> _confirmDelete() async {
    final l10n = context.l10n;
    final confirm = await shad.showDialog<bool>(
      context: context,
      builder: (dialogContext) => shad.AlertDialog(
        barrierColor: Colors.transparent,
        title: Text(l10n.timerRequestDeleteComment),
        content: Text(l10n.timerRequestDeleteCommentConfirm),
        actions: [
          shad.OutlineButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.profileCancel),
          ),
          shad.DestructiveButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.timerRequestDeleteComment),
          ),
        ],
      ),
    );

    if (confirm != true) {
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      await widget.onDeleteComment(widget.comment);
      if (!mounted) {
        return;
      }
      setState(() => _isSubmitting = false);
    } on Exception {
      if (!mounted) {
        return;
      }
      setState(() => _isSubmitting = false);
    }
  }

  String _formatDateTime(DateTime dt) {
    final local = dt.toLocal();
    return '${local.month}/${local.day}/${local.year} '
        '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
  }
}
