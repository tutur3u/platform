import 'dart:async';

import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, OutlinedButton, TextField;
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/models/time_tracking/request_comment.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/widgets/comments_section.dart';
import 'package:mobile/features/time_tracker/widgets/edit_request_dialog.dart';
import 'package:mobile/features/time_tracker/widgets/request_activity_section.dart';
import 'package:mobile/features/time_tracker/widgets/request_detail_actions.dart';
import 'package:mobile/features/time_tracker/widgets/request_detail_shared.dart';
import 'package:mobile/features/time_tracker/widgets/request_image_gallery.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class RequestDetailSheet extends StatefulWidget {
  const RequestDetailSheet({
    required this.request,
    required this.onApprove,
    required this.onReject,
    required this.onRequestInfo,
    required this.wsId,
    this.isManager = false,
    this.canEdit = false,
    this.currentUserId,
    this.onEdit,
    super.key,
  });

  final TimeTrackingRequest request;
  final VoidCallback onApprove;
  final ValueChanged<String?> onReject;
  final ValueChanged<String?> onRequestInfo;
  final String wsId;
  final bool isManager;
  final bool canEdit;
  final String? currentUserId;
  final Future<TimeTrackingRequest?> Function(
    String title,
    DateTime startTime,
    DateTime endTime, {
    String? description,
    List<String>? removedImages,
    List<String>? newImagePaths,
  })?
  onEdit;

  @override
  State<RequestDetailSheet> createState() => _RequestDetailSheetState();
}

class _RequestDetailSheetState extends State<RequestDetailSheet> {
  final TimeTrackerRepository _repo = TimeTrackerRepository();
  final TextEditingController _commentController = TextEditingController();
  List<TimeTrackingRequestComment> _comments = const [];
  bool _isLoadingComments = true;
  bool _isAddingComment = false;
  String? _currentUserId;
  late TimeTrackingRequest _request;

  @override
  void initState() {
    super.initState();
    _request = widget.request;
    _currentUserId = widget.currentUserId;
    unawaited(_loadComments());
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _loadComments() async {
    try {
      final comments = await _repo.getRequestComments(
        widget.wsId,
        widget.request.id,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _comments = comments;
        _isLoadingComments = false;
      });
    } on Object {
      if (!mounted) {
        return;
      }
      setState(() {
        _comments = const [];
        _isLoadingComments = false;
      });
    }
  }

  Future<void> _addComment() async {
    final content = _commentController.text.trim();
    if (content.isEmpty) {
      return;
    }

    setState(() => _isAddingComment = true);
    try {
      await _repo.addRequestComment(widget.wsId, widget.request.id, content);
      _commentController.clear();
      await _loadComments();
      if (!mounted) {
        return;
      }
      setState(() => _isAddingComment = false);
    } on Object {
      if (!mounted) {
        return;
      }
      setState(() => _isAddingComment = false);
    }
  }

  Future<void> _updateComment(
    TimeTrackingRequestComment comment,
    String content,
  ) async {
    await _repo.updateRequestComment(
      widget.wsId,
      widget.request.id,
      comment.id,
      content,
    );
    await _loadComments();
  }

  Future<void> _deleteComment(TimeTrackingRequestComment comment) async {
    await _repo.deleteRequestComment(
      widget.wsId,
      widget.request.id,
      comment.id,
    );
    await _loadComments();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final showManagerActions =
        widget.isManager && _request.approvalStatus == ApprovalStatus.pending;

    return DraggableScrollableSheet(
      initialChildSize: 0.62,
      minChildSize: 0.62,
      maxChildSize: 0.92,
      snap: true,
      snapSizes: const [0.62, 0.92],
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.background,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              _request.title ?? l10n.timerRequestsTitle,
                              style: theme.typography.h3,
                            ),
                          ),
                          RequestStatusBadge(
                            status: _request.approvalStatus,
                          ),
                        ],
                      ),
                      if (widget.canEdit && widget.onEdit != null) ...[
                        const shad.Gap(8),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: shad.TextButton(
                            onPressed: () => _showEditDialog(context),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.edit, size: 16),
                                const shad.Gap(4),
                                Text(l10n.timerRequestEdit),
                              ],
                            ),
                          ),
                        ),
                      ],
                      if (_request.description != null) ...[
                        const shad.Gap(12),
                        Text(
                          _request.description!,
                          style: theme.typography.small.copyWith(
                            color: theme.colorScheme.mutedForeground,
                          ),
                        ),
                      ],
                      const shad.Gap(16),
                      RequestInfoRow(
                        label: l10n.timerDuration,
                        value: _formatDuration(_request.duration),
                      ),
                      if (_request.startTime != null)
                        RequestInfoRow(
                          label: l10n.timerStartTime,
                          value: _formatDateTime(_request.startTime!),
                        ),
                      if (_request.endTime != null)
                        RequestInfoRow(
                          label: l10n.timerEndTime,
                          value: _formatDateTime(_request.endTime!),
                        ),
                      if (_request.images.isNotEmpty) ...[
                        const shad.Gap(16),
                        RequestImageGallery(imagePaths: _request.images),
                      ],
                      if (_request.rejectionReason != null) ...[
                        const shad.Gap(12),
                        RequestReasonBox(
                          text: _request.rejectionReason!,
                          color: theme.colorScheme.destructive,
                        ),
                      ],
                      if (_request.needsInfoReason != null) ...[
                        const shad.Gap(12),
                        RequestReasonBox(
                          text: _request.needsInfoReason!,
                          color: theme.colorScheme.secondary,
                        ),
                      ],
                      const shad.Gap(24),
                      const shad.Divider(),
                      const shad.Gap(16),
                      Text(
                        l10n.timerRequestComments,
                        style: theme.typography.h4,
                      ),
                      const shad.Gap(12),
                      if (_isLoadingComments)
                        const Center(child: shad.CircularProgressIndicator())
                      else
                        CommentsSection(
                          comments: _comments,
                          commentController: _commentController,
                          isAddingComment: _isAddingComment,
                          currentUserId: _currentUserId,
                          onAddComment: _addComment,
                          onEditComment: _updateComment,
                          onDeleteComment: _deleteComment,
                          canAddComments: true,
                        ),
                      const shad.Gap(24),
                      const shad.Divider(),
                      const shad.Gap(16),
                      RequestActivitySection(
                        wsId: widget.wsId,
                        requestId: _request.id,
                      ),
                    ],
                  ),
                ),
              ),
              if (showManagerActions)
                RequestManagerActionsBar(
                  onApprove: widget.onApprove,
                  onReject: widget.onReject,
                  onRequestInfo: widget.onRequestInfo,
                ),
            ],
          ),
        );
      },
    );
  }

  void _showEditDialog(BuildContext context) {
    if (widget.onEdit == null) {
      return;
    }

    unawaited(
      shad.showDialog<void>(
        context: context,
        builder: (_) => EditRequestDialog(
          request: _request,
          onSave:
              (
                title,
                startTime,
                endTime, {
                description,
                removedImages,
                newImagePaths,
              }) async {
                final updatedRequest = await widget.onEdit!(
                  title,
                  startTime,
                  endTime,
                  description: description,
                  removedImages: removedImages,
                  newImagePaths: newImagePaths,
                );
                if (!context.mounted) {
                  return updatedRequest;
                }
                if (updatedRequest != null) {
                  setState(() {
                    _request = updatedRequest;
                  });
                }
                // Note: EditRequestDialog._handleSave will pop the dialog
                return updatedRequest;
              },
        ),
      ),
    );
  }

  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    if (h > 0) return '${h}h ${m}m';
    return '${m}m';
  }

  String _formatDateTime(DateTime dt) {
    final local = dt.toLocal();
    return '${local.month}/${local.day} '
        '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
  }
}
