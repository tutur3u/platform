import 'package:flutter/material.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class RequestStatusBadge extends StatelessWidget {
  const RequestStatusBadge({required this.status, super.key});

  final ApprovalStatus status;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final badgeColors = switch (status) {
      ApprovalStatus.pending => StatusBadgeColors.warning(context),
      ApprovalStatus.approved => StatusBadgeColors.success(context),
      ApprovalStatus.rejected => StatusBadgeColors.error(context),
      ApprovalStatus.needsInfo => StatusBadgeColors.info(context),
    };

    final label = switch (status) {
      ApprovalStatus.pending => context.l10n.timerRequestPending,
      ApprovalStatus.approved => context.l10n.timerRequestApproved,
      ApprovalStatus.rejected => context.l10n.timerRequestRejected,
      ApprovalStatus.needsInfo => context.l10n.timerRequestNeedsInfo,
    };

    return Container(
      decoration: badgeColors.decoration(),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      child: Text(
        label,
        style: theme.typography.small.copyWith(
          color: badgeColors.textColor,
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      ),
    );
  }
}

class RequestInfoRow extends StatelessWidget {
  const RequestInfoRow({
    required this.label,
    required this.value,
    super.key,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          Text(
            value,
            style: theme.typography.small.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
