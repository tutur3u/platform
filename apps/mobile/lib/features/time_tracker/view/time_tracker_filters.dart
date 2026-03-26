import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracker_filter_sheet.dart';

ApprovalStatus? statusFromFilter(TimeTrackerRequestStatusFilter filter) {
  return switch (filter) {
    TimeTrackerRequestStatusFilter.all => null,
    TimeTrackerRequestStatusFilter.pending => ApprovalStatus.pending,
    TimeTrackerRequestStatusFilter.approved => ApprovalStatus.approved,
    TimeTrackerRequestStatusFilter.rejected => ApprovalStatus.rejected,
    TimeTrackerRequestStatusFilter.needsInfo => ApprovalStatus.needsInfo,
  };
}

bool hasActiveFilters({
  required TimeTrackerRequestStatusFilter selectedFilter,
  required bool canManageRequests,
  String? selectedUserId,
}) {
  if (selectedFilter != TimeTrackerRequestStatusFilter.all) {
    return true;
  }

  return canManageRequests &&
      selectedUserId != null &&
      selectedUserId.isNotEmpty;
}

Future<void> showFilterSheet(
  BuildContext context, {
  required TimeTrackerRequestStatusFilter selectedFilter,
  required String? selectedUserId,
  required List<WorkspaceUserOption> availableRequestUsers,
  required bool canManageRequests,
  required void Function(TimeTrackerRequestStatusFilter filter, String? userId)
  onApply,
}) {
  return TimeTrackerFilterSheet.show(
    context,
    selectedFilter: selectedFilter,
    selectedUserId: selectedUserId,
    availableRequestUsers: availableRequestUsers,
    canManageRequests: canManageRequests,
    onApply: onApply,
  );
}
