import 'package:flutter/material.dart' hide AlertDialog;
import 'package:intl/intl.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/features/time_tracker/utils/category_color.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class SessionTile extends StatelessWidget {
  const SessionTile({
    required this.session,
    this.categoryColor,
    this.onEdit,
    this.onDelete,
    super.key,
  });

  final TimeTrackingSession session;
  final String? categoryColor;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;

    final dur = session.duration;
    final durationText = _formatDuration(dur);

    final timeRange = _formatTimeRange(session.startTime, session.endTime);

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
      child: InkWell(
        onTap: onEdit,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              _CategoryDot(color: session.categoryColor ?? categoryColor),
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.title ?? 'Work session',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.base.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (timeRange.isNotEmpty)
                      Text(
                        timeRange,
                        style: theme.typography.small.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                  ],
                ),
              ),
              const shad.Gap(12),
              Text(
                durationText,
                style: theme.typography.base.copyWith(
                  fontWeight: FontWeight.w600,
                  fontFeatures: [const FontFeature.tabularFigures()],
                ),
              ),
            ],
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
}

class _CategoryDot extends StatelessWidget {
  const _CategoryDot({this.color});

  final String? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: resolveTimeTrackingCategoryColor(
          context,
          color,
          fallback: shad.Theme.of(context).colorScheme.muted,
        ),
      ),
    );
  }
}
