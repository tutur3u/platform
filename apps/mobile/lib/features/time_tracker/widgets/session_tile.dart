import 'package:flutter/material.dart' hide AlertDialog;
import 'package:intl/intl.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracking_category_chip.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;

    final dur = session.duration;
    final durationText = _formatDuration(dur);

    final timeRange = _formatTimeRange(session.startTime, session.endTime);
    final categoryLabel = session.categoryName?.trim().isNotEmpty == true
        ? session.categoryName!.trim()
        : l10n.timerNoCategory;
    final colorKey = session.categoryColor ?? categoryColor;

    final descriptionPreview = _descriptionPreview(session.description);

    return Dismissible(
      key: Key(session.id),
      background: Container(
        color: theme.colorScheme.primary,
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.only(left: 20),
        child: Icon(
          shad.LucideIcons.pencil,
          color: theme.colorScheme.primaryForeground,
        ),
      ),
      secondaryBackground: Container(
        color: theme.colorScheme.destructive,
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        child: Icon(
          shad.LucideIcons.trash2,
          color: theme.colorScheme.primaryForeground,
        ),
      ),
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          onEdit?.call();
          return false;
        } else {
          return _confirmDelete(context, l10n);
        }
      },
      onDismissed: (direction) {
        if (direction == DismissDirection.endToStart) {
          onDelete?.call();
        }
      },
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
        child: Material(
          color: theme.colorScheme.card,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onTap ?? onEdit,
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: theme.colorScheme.border),
              ),
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          session.title ?? l10n.timerRunningSessionNoTitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.typography.base.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const shad.Gap(10),
                      _SessionDurationBadge(
                        label: durationText,
                      ),
                    ],
                  ),
                  const shad.Gap(8),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          children: [
                            TimeTrackingCategoryChip(
                              label: categoryLabel,
                              rawColor: colorKey,
                            ),
                            if (session.pendingApproval)
                              shad.OutlineBadge(
                                child: Text(
                                  l10n.timerRequestPending,
                                  style: theme.typography.small.copyWith(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      if (timeRange.isNotEmpty) ...[
                        const shad.Gap(8),
                        Flexible(
                          child: Align(
                            alignment: AlignmentDirectional.centerEnd,
                            child: _SessionTimeRangeChip(label: timeRange),
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (descriptionPreview != null) ...[
                    const shad.Gap(6),
                    Text(
                      descriptionPreview,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.small.copyWith(
                        color: theme.colorScheme.mutedForeground,
                        height: 1.25,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<bool?> _confirmDelete(BuildContext context, AppLocalizations l10n) {
    return shad.showDialog<bool>(
      context: context,
      builder: (dialogContext) => shad.AlertDialog(
        barrierColor: Colors.transparent,
        title: Text(l10n.timerDeleteSession),
        content: Text(l10n.timerDeleteConfirm),
        actions: [
          shad.OutlineButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.commonCancel),
          ),
          shad.DestructiveButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.timerDeleteSession),
          ),
        ],
      ),
    );
  }

  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    final s = d.inSeconds % 60;
    if (h > 0) return '${h}h ${m}m';
    if (m > 0) return '${m}m ${s}s';
    return '${s}s';
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

/// Matches web session duration: dynamic-orange/10 surface, orange ring, mono text.
class _SessionDurationBadge extends StatelessWidget {
  const _SessionDurationBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final orange = DynamicColors.of(context).orange;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        color: orange.withAlpha(26),
        border: Border.all(color: orange.withAlpha(51)),
      ),
      child: Text(
        label,
        style: theme.typography.small.copyWith(
          fontFamily: 'monospace',
          fontWeight: FontWeight.w700,
          fontFeatures: const [FontFeature.tabularFigures()],
          color: orange,
          fontSize: 14,
          height: 1.2,
        ),
      ),
    );
  }
}

/// Clock readout chip: mono digits, dynamic-blue tint (secondary to duration).
class _SessionTimeRangeChip extends StatelessWidget {
  const _SessionTimeRangeChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final blue = DynamicColors.of(context).blue;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        color: blue.withAlpha(26),
        border: Border.all(color: blue.withAlpha(51)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.schedule,
            size: 13,
            color: blue.withAlpha(230),
          ),
          const shad.Gap(5),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 168),
            child: Text(
              label,
              style: theme.typography.small.copyWith(
                fontFamily: 'monospace',
                fontWeight: FontWeight.w600,
                fontFeatures: const [FontFeature.tabularFigures()],
                color: blue,
                fontSize: 11,
                height: 1.2,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
