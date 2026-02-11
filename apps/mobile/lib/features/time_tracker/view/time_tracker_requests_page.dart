import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_state.dart';
import 'package:mobile/features/time_tracker/widgets/request_detail_sheet.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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

class _RequestsView extends StatefulWidget {
  const _RequestsView();

  @override
  State<_RequestsView> createState() => _RequestsViewState();
}

class _RequestsViewState extends State<_RequestsView> {
  _RequestStatusFilter _selectedFilter = _RequestStatusFilter.pending;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          leading: [
            shad.OutlineButton(
              density: shad.ButtonDensity.icon,
              onPressed: () => context.pop(),
              child: const Icon(Icons.arrow_back),
            ),
          ],
          title: Text(l10n.timerRequestsTitle),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
          child: shad.OutlineButton(
            onPressed: () {
              shad.showDropdown<void>(
                context: context,
                builder: (context) {
                  return shad.DropdownMenu(
                    children: [
                      shad.MenuButton(
                        leading: const Icon(Icons.hourglass_empty, size: 16),
                        onPressed: (context) => _applyFilter(
                          _RequestStatusFilter.pending,
                          wsId,
                        ),
                        child: Text(l10n.timerRequestPending),
                      ),
                      shad.MenuButton(
                        leading: const Icon(
                          Icons.check_circle_outline,
                          size: 16,
                        ),
                        onPressed: (context) => _applyFilter(
                          _RequestStatusFilter.approved,
                          wsId,
                        ),
                        child: Text(l10n.timerRequestApproved),
                      ),
                      shad.MenuButton(
                        leading: const Icon(Icons.cancel_outlined, size: 16),
                        onPressed: (context) => _applyFilter(
                          _RequestStatusFilter.rejected,
                          wsId,
                        ),
                        child: Text(l10n.timerRequestRejected),
                      ),
                      shad.MenuButton(
                        leading: const Icon(Icons.help_outline, size: 16),
                        onPressed: (context) => _applyFilter(
                          _RequestStatusFilter.needsInfo,
                          wsId,
                        ),
                        child: Text(l10n.timerRequestNeedsInfo),
                      ),
                    ],
                  );
                },
              );
            },
            child: Row(
              children: [
                const Icon(Icons.filter_list, size: 16),
                const shad.Gap(8),
                Expanded(
                  child: Text(
                    _filterLabel(context, _selectedFilter),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const shad.Gap(8),
                const Icon(Icons.keyboard_arrow_down, size: 16),
              ],
            ),
          ),
        ),
      ],
      child: BlocBuilder<TimeTrackerRequestsCubit, TimeTrackerRequestsState>(
        builder: (context, state) {
          if (state.status == TimeTrackerRequestsStatus.loading) {
            return const Center(child: shad.CircularProgressIndicator());
          }

          if (state.status == TimeTrackerRequestsStatus.error) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    shad.LucideIcons.circleAlert,
                    size: 48,
                    color: shad.Theme.of(context).colorScheme.destructive,
                  ),
                  const shad.Gap(16),
                  Text(state.error ?? 'Error'),
                  const shad.Gap(16),
                  shad.SecondaryButton(
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
                style: shad.Theme.of(context).typography.textMuted,
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () =>
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
    );
  }

  void _showRequestDetail(BuildContext context, TimeTrackingRequest request) {
    final cubit = context.read<TimeTrackerRequestsCubit>();
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
    final currentUserId = context.read<AuthCubit>().state.user?.id;

    unawaited(
      shad.openDrawer<void>(
        context: context,
        position: shad.OverlayPosition.bottom,
        builder: (_) => RequestDetailSheet(
          request: request,
          wsId: wsId,
          currentUserId: currentUserId,
          isManager: true,
          onApprove: () => unawaited(cubit.approveRequest(request.id, wsId)),
          onReject: (reason) =>
              unawaited(cubit.rejectRequest(request.id, wsId, reason: reason)),
          onRequestInfo: (reason) => unawaited(
            cubit.requestMoreInfo(request.id, wsId, reason: reason),
          ),
          canEdit:
              request.approvalStatus == ApprovalStatus.pending ||
              request.approvalStatus == ApprovalStatus.needsInfo,
          onEdit:
              (
                title,
                startTime,
                endTime, {
                description,
                removedImages,
                newImagePaths,
              }) => cubit.updateRequest(
                wsId,
                request.id,
                title,
                startTime,
                endTime,
                description: description,
                removedImages: removedImages,
                newImagePaths: newImagePaths,
              ),
        ),
      ),
    );
  }

  String _filterLabel(BuildContext context, _RequestStatusFilter filter) {
    final l10n = context.l10n;
    return switch (filter) {
      _RequestStatusFilter.pending => l10n.timerRequestPending,
      _RequestStatusFilter.approved => l10n.timerRequestApproved,
      _RequestStatusFilter.rejected => l10n.timerRequestRejected,
      _RequestStatusFilter.needsInfo => l10n.timerRequestNeedsInfo,
    };
  }

  void _applyFilter(_RequestStatusFilter filter, String wsId) {
    setState(() => _selectedFilter = filter);

    final cubit = context.read<TimeTrackerRequestsCubit>();
    final status = switch (filter) {
      _RequestStatusFilter.pending => ApprovalStatus.pending,
      _RequestStatusFilter.approved => ApprovalStatus.approved,
      _RequestStatusFilter.rejected => ApprovalStatus.rejected,
      _RequestStatusFilter.needsInfo => ApprovalStatus.needsInfo,
    };

    unawaited(cubit.filterByStatus(status, wsId));
  }
}

enum _RequestStatusFilter { pending, approved, rejected, needsInfo }

class _RequestTile extends StatelessWidget {
  const _RequestTile({required this.request, this.onTap});

  final TimeTrackingRequest request;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    final (statusLabel, statusColor) = switch (request.approvalStatus) {
      ApprovalStatus.pending => ('Pending', colorScheme.primary),
      ApprovalStatus.approved => ('Approved', colorScheme.foreground),
      ApprovalStatus.rejected => ('Rejected', colorScheme.destructive),
      ApprovalStatus.needsInfo => ('Needs info', colorScheme.mutedForeground),
    };

    return shad.GhostButton(
      onPressed: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.pending_actions, color: statusColor, size: 20),
            ),
            const shad.Gap(16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    request.title ?? 'Request',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.p,
                  ),
                  Text(
                    statusLabel,
                    style: theme.typography.textSmall.copyWith(
                      color: statusColor,
                    ),
                  ),
                ],
              ),
            ),
            if (request.startTime != null)
              Text(
                _formatDate(request.startTime!),
                style: theme.typography.textSmall.copyWith(
                  color: colorScheme.mutedForeground,
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime dt) {
    final local = dt.toLocal();
    return '${local.month}/${local.day}';
  }
}
