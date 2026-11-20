import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/features/time_tracker/utils/duration.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracking_category_chip.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

class SessionTile extends StatelessWidget {
  const SessionTile({
    required this.session,
    this.categoryColor,
    this.onTap,
    this.onEdit,
    this.onDelete,
    super.key,
  });

  final TimeTrackingSession session;
  final String? categoryColor;

  /// Called when the tile is tapped. Defaults to [onEdit] when not provided.
  final VoidCallback? onTap;

  /// Called when the tile is swiped right (edit gesture).
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final l10n = context.l10n;

    final dur = session.duration;
    final durationText = formatTimerDuration(
      dur,
      invalidDurationLabel: l10n.timerInvalidDuration,
    );

    final timeRange = _formatTimeRange(session.startTime, session.endTime);
    final categoryLabel = session.categoryName?.trim().isNotEmpty == true
        ? session.categoryName!.trim()
        : l10n.timerNoCategory;
    final colorKey = session.categoryColor ?? categoryColor;

    final descriptionPreview = _descriptionPreview(session.description);

    return PendingSyncFrame(
      workspaceId: session.wsId ?? '',
      feature: 'time_tracker',
      entityId: session.id,
      child: Dismissible(
        key: Key(session.id),
        background: Container(
          color: colors.primary,
          alignment: AlignmentDirectional.centerStart,
          padding: const EdgeInsetsDirectional.only(start: AppSpacing.lg),
          child: Icon(LucideIcons.pencil, color: colors.primaryForeground),
        ),
        secondaryBackground: Container(
          color: colors.destructive,
          alignment: AlignmentDirectional.centerEnd,
          padding: const EdgeInsetsDirectional.only(end: AppSpacing.lg),
          child: Icon(LucideIcons.trash2, color: colors.primaryForeground),
        ),
        confirmDismiss: (direction) async {
          if (direction == DismissDirection.startToEnd) {
            onEdit?.call();
            return false;
          } else {
            return await _confirmDelete(context, l10n);
          }
        },
        onDismissed: (direction) {
          if (direction == DismissDirection.endToStart) {
            onDelete?.call();
          }
        },
        child: Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.xs),
          child: AppGroupedCard(
            children: [
              AppGroupedRow(
                leading: const AppIconTile(
                  icon: LucideIcons.clock,
                  tone: AppTone.primary,
                ),
                title: Text(session.title ?? l10n.timerRunningSessionNoTitle),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (timeRange.isNotEmpty) Text(timeRange),
                    const AppGap(AppSpacing.xxs),
                    Wrap(
                      spacing: AppSpacing.xs,
                      runSpacing: AppSpacing.xs,
                      children: [
                        TimeTrackingCategoryChip(
                          label: categoryLabel,
                          rawColor: colorKey,
                        ),
                        if (session.pendingApproval)
                          AppBadge(
                            variant: AppBadgeVariant.warning,
                            child: Text(l10n.timerRequestPending),
                          ),
                      ],
                    ),
                    if (descriptionPreview != null)
                      Text(
                        descriptionPreview,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
                trailing: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 104),
                  child: Text(
                    durationText,
                    textAlign: TextAlign.end,
                    style: const TextStyle(
                      fontFeatures: [FontFeature.tabularFigures()],
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                onTap: onTap ?? onEdit,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<bool?> _confirmDelete(BuildContext context, AppLocalizations l10n) {
    return showAppDialog<bool>(
      context: context,
      builder: (dialogContext) => AppDialog(
        title: l10n.timerDeleteSession,
        content: Text(l10n.timerDeleteConfirm),
        actions: [
          AppButton.outline(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.commonCancel),
          ),
          AppButton.destructive(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.timerDeleteSession),
          ),
        ],
      ),
    );
  }

  String _formatTimeRange(DateTime? start, DateTime? end) {
    if (start == null) return '';
    final fmt = DateFormat.Hm();
    final startStr = fmt.format(start.toLocal());
    if (end == null) return startStr;
    final endStr = fmt.format(end.toLocal());
    return '$startStr – $endStr';
  }

  String? _descriptionPreview(String? raw) {
    if (raw == null) return null;
    final collapsed = raw.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (collapsed.isEmpty) return null;
    return collapsed;
  }
}
