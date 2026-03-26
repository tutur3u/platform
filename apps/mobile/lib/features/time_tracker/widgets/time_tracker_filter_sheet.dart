import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

enum TimeTrackerRequestStatusFilter {
  all,
  pending,
  approved,
  rejected,
  needsInfo,
}

List<WorkspaceUserOption> buildAvailableRequestUsers(
  List<WorkspaceUserOption> users,
) {
  final uniqueUsers = <String, WorkspaceUserOption>{};
  for (final user in users) {
    if (user.id.isEmpty) {
      continue;
    }
    uniqueUsers[user.id] = user;
  }

  final sorted = uniqueUsers.values.toList()
    ..sort((a, b) => a.label.toLowerCase().compareTo(b.label.toLowerCase()));
  return sorted;
}

class TimeTrackerFilterSheet extends StatefulWidget {
  const TimeTrackerFilterSheet({
    required this.selectedFilter,
    required this.selectedUserId,
    required this.availableRequestUsers,
    required this.canManageRequests,
    required this.onApply,
    super.key,
  });

  final TimeTrackerRequestStatusFilter selectedFilter;
  final String? selectedUserId;
  final List<WorkspaceUserOption> availableRequestUsers;
  final bool canManageRequests;
  final void Function(TimeTrackerRequestStatusFilter filter, String? userId)
  onApply;

  static Future<void> show(
    BuildContext context, {
    required TimeTrackerRequestStatusFilter selectedFilter,
    required String? selectedUserId,
    required List<WorkspaceUserOption> availableRequestUsers,
    required bool canManageRequests,
    required void Function(
      TimeTrackerRequestStatusFilter filter,
      String? userId,
    )
    onApply,
  }) {
    return showAdaptiveSheet<void>(
      context: context,
      builder: (_) {
        return TimeTrackerFilterSheet(
          selectedFilter: selectedFilter,
          selectedUserId: selectedUserId,
          availableRequestUsers: availableRequestUsers,
          canManageRequests: canManageRequests,
          onApply: onApply,
        );
      },
    );
  }

  @override
  State<TimeTrackerFilterSheet> createState() => _TimeTrackerFilterSheetState();
}

class _TimeTrackerFilterSheetState extends State<TimeTrackerFilterSheet> {
  late TimeTrackerRequestStatusFilter _tempFilter;
  late String? _tempUserId;

  @override
  void initState() {
    super.initState();
    _tempFilter = widget.selectedFilter;
    _tempUserId = widget.selectedUserId;
    if (widget.canManageRequests &&
        _tempUserId != null &&
        !widget.availableRequestUsers.any((user) => user.id == _tempUserId)) {
      _tempUserId = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          16,
          16,
          16,
          16,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l10n.timerRequestsFilterTitle,
              style: shad.Theme.of(context).typography.h4,
            ),
            const shad.Gap(16),
            Text(
              l10n.timerRequestsFilterStatusLabel,
              style: shad.Theme.of(context).typography.small,
            ),
            const shad.Gap(8),
            shad.OutlineButton(
              onPressed: () {
                shad.showDropdown<void>(
                  context: context,
                  builder: (context) {
                    return shad.DropdownMenu(
                      children: TimeTrackerRequestStatusFilter.values
                          .map(
                            (filter) => shad.MenuButton(
                              leading: _tempFilter == filter
                                  ? const Icon(Icons.check, size: 16)
                                  : const SizedBox(width: 16, height: 16),
                              onPressed: (context) {
                                setState(() => _tempFilter = filter);
                              },
                              child: Text(_filterLabel(context, filter)),
                            ),
                          )
                          .toList(),
                    );
                  },
                );
              },
              child: Row(
                children: [
                  Expanded(child: Text(_filterLabel(context, _tempFilter))),
                  const shad.Gap(8),
                  const Icon(Icons.keyboard_arrow_down, size: 16),
                ],
              ),
            ),
            if (widget.canManageRequests) ...[
              const shad.Gap(16),
              Text(
                l10n.timerRequestsFilterUserLabel,
                style: shad.Theme.of(context).typography.small,
              ),
              const shad.Gap(8),
              shad.OutlineButton(
                onPressed: () {
                  shad.showDropdown<void>(
                    context: context,
                    builder: (context) {
                      return shad.DropdownMenu(
                        children: [
                          shad.MenuButton(
                            leading: _tempUserId == null
                                ? const Icon(Icons.check, size: 16)
                                : const SizedBox(width: 16, height: 16),
                            onPressed: (context) {
                              setState(() => _tempUserId = null);
                            },
                            child: Text(l10n.timerRequestsFilterAllUsers),
                          ),
                          ...widget.availableRequestUsers.map(
                            (user) => shad.MenuButton(
                              leading: _tempUserId == user.id
                                  ? const Icon(Icons.check, size: 16)
                                  : const SizedBox(width: 16, height: 16),
                              onPressed: (context) {
                                setState(() => _tempUserId = user.id);
                              },
                              child: Text(user.label),
                            ),
                          ),
                        ],
                      );
                    },
                  );
                },
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _selectedUserFilterLabel(context, _tempUserId),
                      ),
                    ),
                    const shad.Gap(8),
                    const Icon(Icons.keyboard_arrow_down, size: 16),
                  ],
                ),
              ),
            ],
            const shad.Gap(20),
            Row(
              children: [
                Expanded(
                  child: shad.OutlineButton(
                    onPressed: () {
                      setState(() {
                        _tempFilter = TimeTrackerRequestStatusFilter.all;
                        _tempUserId = null;
                      });
                    },
                    child: Center(child: Text(l10n.timerRequestsFilterClear)),
                  ),
                ),
                const shad.Gap(8),
                Expanded(
                  child: shad.PrimaryButton(
                    onPressed: () {
                      Navigator.of(context).pop();
                      widget.onApply(_tempFilter, _tempUserId);
                    },
                    child: Center(child: Text(l10n.timerRequestsFilterApply)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _filterLabel(
    BuildContext context,
    TimeTrackerRequestStatusFilter filter,
  ) {
    final l10n = context.l10n;
    return switch (filter) {
      TimeTrackerRequestStatusFilter.all => l10n.timerRequestsFilterAllStatuses,
      TimeTrackerRequestStatusFilter.pending => l10n.timerRequestPending,
      TimeTrackerRequestStatusFilter.approved => l10n.timerRequestApproved,
      TimeTrackerRequestStatusFilter.rejected => l10n.timerRequestRejected,
      TimeTrackerRequestStatusFilter.needsInfo => l10n.timerRequestNeedsInfo,
    };
  }

  String _selectedUserFilterLabel(BuildContext context, String? userId) {
    if (userId == null || userId.isEmpty) {
      return context.l10n.timerRequestsFilterAllUsers;
    }

    for (final user in widget.availableRequestUsers) {
      if (user.id == userId) {
        return user.label;
      }
    }

    return context.l10n.timerRequestsFilterAllUsers;
  }
}
