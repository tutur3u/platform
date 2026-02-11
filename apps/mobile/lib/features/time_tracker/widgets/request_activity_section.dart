import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/request_activity.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class RequestActivitySection extends StatefulWidget {
  const RequestActivitySection({
    required this.wsId,
    required this.requestId,
    super.key,
  });

  final String wsId;
  final String requestId;

  @override
  State<RequestActivitySection> createState() => _RequestActivitySectionState();
}

class _RequestActivitySectionState extends State<RequestActivitySection> {
  static const int _itemsPerPage = 5;

  int _currentPage = 1;
  bool _isLoading = true;
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
        Row(
          children: [
            Text(l10n.timerRequestActivity, style: theme.typography.h4),
            const shad.Gap(8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: theme.colorScheme.muted,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text('${_response.total}', style: theme.typography.small),
            ),
          ],
        ),
        const shad.Gap(12),
        if (_isLoading)
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
          ..._response.data.map(
            (activity) => _ActivityTile(activity: activity),
          ),
          if (_response.totalPages > 1)
            _PaginationRow(
              currentPage: _currentPage,
              totalPages: _response.totalPages,
              onPrevious: () =>
                  unawaited(_loadActivity(page: _currentPage - 1)),
              onNext: () => unawaited(_loadActivity(page: _currentPage + 1)),
            ),
        ],
      ],
    );
  }
}

class _ActivityTile extends StatelessWidget {
  const _ActivityTile({required this.activity});

  final TimeTrackingRequestActivity activity;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
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
                  '${activity.actorLabel} '
                  '${_actionLabel(l10n, activity.actionType)}',
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Text(
                _formatDateTime(activity.createdAt),
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                  fontSize: 11,
                ),
              ),
            ],
          ),
          if (activity.commentContent != null &&
              activity.commentContent!.isNotEmpty) ...[
            const shad.Gap(6),
            Text(activity.commentContent!, style: theme.typography.small),
          ],
          if (activity.feedbackReason != null &&
              activity.feedbackReason!.isNotEmpty) ...[
            const shad.Gap(6),
            Text(
              activity.feedbackReason!,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _actionLabel(
    AppLocalizations l10n,
    TimeTrackingRequestActivityAction action,
  ) {
    return switch (action) {
      TimeTrackingRequestActivityAction.created =>
        l10n.timerRequestActivityCreated,
      TimeTrackingRequestActivityAction.contentUpdated =>
        l10n.timerRequestActivityContentUpdated,
      TimeTrackingRequestActivityAction.statusChanged =>
        l10n.timerRequestActivityStatusChanged,
      TimeTrackingRequestActivityAction.commentAdded =>
        l10n.timerRequestActivityCommentAdded,
      TimeTrackingRequestActivityAction.commentUpdated =>
        l10n.timerRequestActivityCommentUpdated,
      TimeTrackingRequestActivityAction.commentDeleted =>
        l10n.timerRequestActivityCommentDeleted,
      TimeTrackingRequestActivityAction.unknown =>
        l10n.timerRequestActivityUpdated,
    };
  }

  String _formatDateTime(DateTime dt) {
    final local = dt.toLocal();
    return '${local.month}/${local.day} '
        '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
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
          child: Center(child: Text('$currentPage/$totalPages')),
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
