import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/models/time_tracking/request_activity.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/widgets/request_detail_shared.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class RequestActivitySection extends StatefulWidget {
  const RequestActivitySection({
    required this.wsId,
    required this.requestId,
    this.onTotalChanged,
    super.key,
  });

  final String wsId;
  final String requestId;
  final ValueChanged<int>? onTotalChanged;

  @override
  State<RequestActivitySection> createState() => _RequestActivitySectionState();
}

class _RequestActivitySectionState extends State<RequestActivitySection> {
  static const int _itemsPerPage = 5;

  int _currentPage = 1;
  bool _isLoading = true;
  bool _isInitialized = false;
  String? _error;
  TimeTrackingRequestActivityResponse _response =
      const TimeTrackingRequestActivityResponse(
        data: [],
        total: 0,
        page: 1,
        limit: _itemsPerPage,
      );

  @override
  void initState() {
    super.initState();
    unawaited(_loadActivity());
  }

  Future<void> _loadActivity({int? page}) async {
    setState(() {
      _isLoading = true;
      _error = null;
      if (page != null) {
        _currentPage = page;
      }
    });

    try {
      final response = await TimeTrackerRepository().getRequestActivities(
        widget.wsId,
        widget.requestId,
        page: _currentPage,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _response = response;
        _isLoading = false;
        if (!_isInitialized) {
          _isInitialized = true;
          widget.onTotalChanged?.call(response.total);
        }
      });
    } on Object catch (e) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_isLoading && _response.data.isEmpty)
          const Center(child: shad.CircularProgressIndicator())
        else if (_error != null)
          _ActivityErrorState(
            message: _error!,
            onRetry: () => unawaited(_loadActivity()),
          )
        else if (_response.data.isEmpty)
          Text(
            l10n.timerRequestNoActivity,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
            textAlign: TextAlign.center,
          )
        else ...[
          ..._response.data.asMap().entries.map((entry) {
            final index = entry.key;
            final activity = entry.value;
            return _ActivityTimelineItem(
              activity: activity,
              isLast: index == _response.data.length - 1,
            );
          }),
          if (_response.totalPages > 1) ...[
            const shad.Gap(16),
            _PaginationRow(
              currentPage: _currentPage,
              totalPages: _response.totalPages,
              onPrevious: () =>
                  unawaited(_loadActivity(page: _currentPage - 1)),
              onNext: () => unawaited(_loadActivity(page: _currentPage + 1)),
            ),
          ],
        ],
      ],
    );
  }
}

class _ActivityTimelineItem extends StatelessWidget {
  const _ActivityTimelineItem({required this.activity, required this.isLast});

  final TimeTrackingRequestActivity activity;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: theme.colorScheme.background,
                  border: Border.all(color: theme.colorScheme.border, width: 2),
                  shape: BoxShape.circle,
                ),
                child: Center(child: _getActionIcon(activity.actionType)),
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    color: theme.colorScheme.border,
                    margin: const EdgeInsets.symmetric(vertical: 4),
                  ),
                ),
            ],
          ),
          const shad.Gap(12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 12,
                        backgroundImage: activity.actorAvatarUrl != null
                            ? NetworkImage(activity.actorAvatarUrl!)
                            : null,
                        backgroundColor: theme.colorScheme.muted,
                        child: activity.actorAvatarUrl == null
                            ? Text(
                                (activity.actorDisplayName ??
                                        activity.actorHandle ??
                                        '?')[0]
                                    .toUpperCase(),
                                style: theme.typography.small.copyWith(
                                  fontSize: 10,
                                  color: theme.colorScheme.mutedForeground,
                                ),
                              )
                            : null,
                      ),
                      const shad.Gap(8),
                      Expanded(
                        child: Text(
                          activity.actorLabel,
                          style: theme.typography.small.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const shad.Gap(8),
                      Text(
                        _formatRelativeTime(activity.createdAt),
                        style: theme.typography.small.copyWith(
                          color: theme.colorScheme.mutedForeground,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                  const shad.Gap(4),
                  _ActivityContent(activity: activity),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _getActionIcon(TimeTrackingRequestActivityAction action) {
    return switch (action) {
      TimeTrackingRequestActivityAction.created => const Icon(
        Icons.access_time,
        size: 16,
      ),
      TimeTrackingRequestActivityAction.contentUpdated => const Icon(
        Icons.edit_note,
        size: 16,
      ),
      TimeTrackingRequestActivityAction.statusChanged => const Icon(
        Icons.sync,
        size: 16,
      ),
      TimeTrackingRequestActivityAction.commentAdded ||
      TimeTrackingRequestActivityAction.commentUpdated ||
      TimeTrackingRequestActivityAction.commentDeleted => const Icon(
        Icons.chat_bubble_outline,
        size: 16,
      ),
      TimeTrackingRequestActivityAction.unknown => const Icon(
        Icons.help_outline,
        size: 16,
      ),
    };
  }

  String _formatRelativeTime(DateTime createdAt) {
    final now = DateTime.now();
    final difference = now.difference(createdAt);

    if (difference.inDays > 7) {
      return '${createdAt.month}/${createdAt.day}/${createdAt.year}';
    } else if (difference.inDays >= 1) {
      return '${difference.inDays}d ago';
    } else if (difference.inHours >= 1) {
      return '${difference.inHours}h ago';
    } else if (difference.inMinutes >= 1) {
      return '${difference.inMinutes}m ago';
    } else {
      return 'just now';
    }
  }
}

class _ActivityContent extends StatelessWidget {
  const _ActivityContent({required this.activity});

  final TimeTrackingRequestActivity activity;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return switch (activity.actionType) {
      TimeTrackingRequestActivityAction.created => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.timerRequestActivityActionCreated,
            style: theme.typography.small,
          ),
          if (activity.metadata?['title'] != null) ...[
            const shad.Gap(4),
            Text(
              '${l10n.timerRequestActivityTitleLabel}: '
              '${activity.metadata!['title']}',
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ],
        ],
      ),
      TimeTrackingRequestActivityAction.statusChanged => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.timerRequestActivityActionStatusChanged,
            style: theme.typography.small,
          ),
          const shad.Gap(8),
          Row(
            children: [
              if (activity.previousStatus != null) ...[
                RequestStatusBadge(
                  status: approvalStatusFromString(activity.previousStatus),
                ),
                const shad.Gap(8),
                const Icon(Icons.arrow_forward, size: 14),
                const shad.Gap(8),
              ],
              if (activity.newStatus != null)
                RequestStatusBadge(
                  status: approvalStatusFromString(activity.newStatus),
                ),
            ],
          ),
          if (activity.feedbackReason != null &&
              activity.feedbackReason!.isNotEmpty) ...[
            const shad.Gap(8),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: theme.colorScheme.muted.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: theme.colorScheme.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${l10n.timerRequestActivityFeedbackLabel}:',
                    style: theme.typography.small.copyWith(
                      fontWeight: FontWeight.w600,
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                  const shad.Gap(2),
                  Text(activity.feedbackReason!, style: theme.typography.small),
                ],
              ),
            ),
          ],
        ],
      ),
      TimeTrackingRequestActivityAction.contentUpdated => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.timerRequestActivityActionContentUpdated,
            style: theme.typography.small,
          ),
          if (activity.changedFields != null) ...[
            const shad.Gap(4),
            ...activity.changedFields!.entries.map((entry) {
              final field = entry.key;
              final values = entry.value;
              return Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: '${_formatFieldName(context, field)}: ',
                        style: const TextStyle(fontWeight: FontWeight.w500),
                      ),
                      TextSpan(
                        text: _formatFieldValue(values['old'], field),
                        style: const TextStyle(
                          decoration: TextDecoration.lineThrough,
                        ),
                      ),
                      const TextSpan(text: ' → '),
                      TextSpan(text: _formatFieldValue(values['new'], field)),
                    ],
                  ),
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.mutedForeground,
                    fontSize: 12,
                  ),
                ),
              );
            }),
          ],
        ],
      ),
      TimeTrackingRequestActivityAction.commentAdded ||
      TimeTrackingRequestActivityAction.commentUpdated ||
      TimeTrackingRequestActivityAction.commentDeleted => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _commentActionLabel(l10n, activity.actionType),
            style: theme.typography.small.copyWith(
              color:
                  activity.actionType ==
                      TimeTrackingRequestActivityAction.commentDeleted
                  ? theme.colorScheme.destructive
                  : null,
            ),
          ),
          if (activity.commentContent != null) ...[
            const shad.Gap(8),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: theme.colorScheme.muted.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color:
                      activity.actionType ==
                          TimeTrackingRequestActivityAction.commentDeleted
                      ? theme.colorScheme.destructive.withValues(alpha: 0.2)
                      : theme.colorScheme.border,
                ),
              ),
              child: Text(
                activity.commentContent!,
                style: theme.typography.small.copyWith(
                  decoration:
                      activity.actionType ==
                          TimeTrackingRequestActivityAction.commentDeleted
                      ? TextDecoration.lineThrough
                      : null,
                  color:
                      activity.actionType ==
                          TimeTrackingRequestActivityAction.commentDeleted
                      ? theme.colorScheme.mutedForeground
                      : null,
                ),
              ),
            ),
          ],
        ],
      ),
      _ => Text(
        l10n.timerRequestActivityUpdated,
        style: theme.typography.small,
      ),
    };
  }

  String _commentActionLabel(
    AppLocalizations l10n,
    TimeTrackingRequestActivityAction action,
  ) {
    return switch (action) {
      TimeTrackingRequestActivityAction.commentAdded =>
        l10n.timerRequestActivityActionCommentAdded,
      TimeTrackingRequestActivityAction.commentUpdated =>
        l10n.timerRequestActivityActionCommentUpdated,
      TimeTrackingRequestActivityAction.commentDeleted =>
        l10n.timerRequestActivityActionCommentDeleted,
      _ => '',
    };
  }

  String _formatFieldName(BuildContext context, String field) {
    final l10n = context.l10n;
    return switch (field) {
      'start_time' => l10n.timerRequestActivityFieldStartTime,
      'end_time' => l10n.timerRequestActivityFieldEndTime,
      'title' => l10n.timerRequestActivityFieldTitle,
      'description' => l10n.timerRequestActivityFieldDescription,
      _ => field.replaceAll('_', ' '),
    };
  }

  String _formatFieldValue(dynamic value, String field) {
    if (value == null) return 'empty';
    if (field == 'start_time' || field == 'end_time') {
      try {
        final dt = DateTime.parse(value.toString()).toLocal();
        return '${dt.month}/${dt.day} '
            '${dt.hour.toString().padLeft(2, '0')}:'
            '${dt.minute.toString().padLeft(2, '0')}';
      } on Exception catch (_) {
        return value.toString();
      }
    }
    return value.toString();
  }
}

class _PaginationRow extends StatelessWidget {
  const _PaginationRow({
    required this.currentPage,
    required this.totalPages,
    required this.onPrevious,
    required this.onNext,
  });

  final int currentPage;
  final int totalPages;
  final VoidCallback onPrevious;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Row(
      children: [
        shad.OutlineButton(
          onPressed: currentPage > 1 ? onPrevious : null,
          child: Text(l10n.commonPrevious),
        ),
        const shad.Gap(8),
        Expanded(
          child: Center(
            child: Text(
              l10n.timerRequestActivityPageInfo(
                currentPage,
                totalPages,
              ),
            ),
          ),
        ),
        const shad.Gap(8),
        shad.OutlineButton(
          onPressed: currentPage < totalPages ? onNext : null,
          child: Text(l10n.commonNext),
        ),
      ],
    );
  }
}

class _ActivityErrorState extends StatelessWidget {
  const _ActivityErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      children: [
        Text(message, textAlign: TextAlign.center),
        const shad.Gap(8),
        shad.OutlineButton(onPressed: onRetry, child: Text(l10n.commonRetry)),
      ],
    );
  }
}
