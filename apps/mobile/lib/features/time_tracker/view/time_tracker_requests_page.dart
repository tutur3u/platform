import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_state.dart';
import 'package:mobile/features/time_tracker/widgets/request_detail_sheet.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class TimeTrackerRequestsPage extends StatelessWidget {
  const TimeTrackerRequestsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final cubit = TimeTrackerRequestsCubit(
          repository: TimeTrackerRepository(),
        );
        final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
        if (wsId != null) unawaited(cubit.loadRequests(wsId));
        return cubit;
      },
      child: const _RequestsView(),
    );
  }
}

class _RequestsView extends StatelessWidget {
  const _RequestsView();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.timerRequestsTitle),
          bottom: TabBar(
            isScrollable: true,
            onTap: (index) {
              final cubit = context.read<TimeTrackerRequestsCubit>();
              final status = switch (index) {
                1 => ApprovalStatus.pending,
                2 => ApprovalStatus.approved,
                3 => ApprovalStatus.rejected,
                _ => null,
              };
              unawaited(cubit.filterByStatus(status, wsId));
            },
            tabs: [
              Tab(text: l10n.timerHistory), // "All"
              Tab(text: l10n.timerRequestPending),
              Tab(text: l10n.timerRequestApproved),
              Tab(text: l10n.timerRequestRejected),
            ],
          ),
        ),
        body: BlocBuilder<TimeTrackerRequestsCubit, TimeTrackerRequestsState>(
          builder: (context, state) {
            if (state.status == TimeTrackerRequestsStatus.loading) {
              return const Center(child: CircularProgressIndicator());
            }

            if (state.status == TimeTrackerRequestsStatus.error) {
              return Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.error_outline,
                      size: 48,
                      color: Theme.of(context).colorScheme.error,
                    ),
                    const SizedBox(height: 16),
                    Text(state.error ?? 'Error'),
                    const SizedBox(height: 16),
                    FilledButton.tonal(
                      onPressed: () => unawaited(
                        context.read<TimeTrackerRequestsCubit>().loadRequests(
                          wsId,
                        ),
                      ),
                      child: Text(l10n.commonRetry),
                    ),
                  ],
                ),
              );
            }

            if (state.requests.isEmpty) {
              return Center(
                child: Text(
                  l10n.timerNoSessions,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              );
            }

            return RefreshIndicator(
              onRefresh: () async =>
                  context.read<TimeTrackerRequestsCubit>().loadRequests(wsId),
              child: ListView.builder(
                itemCount: state.requests.length,
                padding: const EdgeInsets.only(bottom: 32),
                itemBuilder: (context, index) {
                  final request = state.requests[index];
                  return _RequestTile(
                    request: request,
                    onTap: () => _showRequestDetail(context, request),
                  );
                },
              ),
            );
          },
        ),
      ),
    );
  }

  void _showRequestDetail(BuildContext context, TimeTrackingRequest request) {
    final cubit = context.read<TimeTrackerRequestsCubit>();
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';

    unawaited(
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => RequestDetailSheet(
          request: request,
          isManager: true,
          onApprove: () => unawaited(cubit.approveRequest(request.id, wsId)),
          onReject: (reason) =>
              unawaited(cubit.rejectRequest(request.id, wsId, reason: reason)),
          onRequestInfo: (reason) => unawaited(
            cubit.requestMoreInfo(request.id, wsId, reason: reason),
          ),
        ),
      ),
    );
  }
}

class _RequestTile extends StatelessWidget {
  const _RequestTile({required this.request, this.onTap});

  final TimeTrackingRequest request;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    final (statusLabel, statusColor) = switch (request.approvalStatus) {
      ApprovalStatus.pending => ('Pending', colorScheme.tertiary),
      ApprovalStatus.approved => ('Approved', colorScheme.primary),
      ApprovalStatus.rejected => ('Rejected', colorScheme.error),
      ApprovalStatus.needsInfo => ('Needs info', colorScheme.secondary),
    };

    return ListTile(
      onTap: onTap,
      leading: CircleAvatar(
        backgroundColor: statusColor.withValues(alpha: 0.15),
        child: Icon(Icons.pending_actions, color: statusColor, size: 20),
      ),
      title: Text(
        request.title ?? 'Request',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(
        statusLabel,
        style: textTheme.bodySmall?.copyWith(color: statusColor),
      ),
      trailing: request.startTime != null
          ? Text(
              _formatDate(request.startTime!),
              style: textTheme.labelSmall?.copyWith(
                color: colorScheme.onSurfaceVariant,
              ),
            )
          : null,
    );
  }

  String _formatDate(DateTime dt) {
    final local = dt.toLocal();
    return '${local.month}/${local.day}';
  }
}
