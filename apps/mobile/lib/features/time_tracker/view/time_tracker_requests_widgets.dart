part of 'time_tracker_requests_page.dart';

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
