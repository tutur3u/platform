import 'dart:async';

import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, TextButton, TextField;
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/features/time_tracker/utils/category_color.dart';
import 'package:mobile/features/time_tracker/widgets/edit_session_dialog.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// A read-only bottom sheet that shows the full details of a
/// [TimeTrackingSession].
///
/// An "Edit" button opens [EditSessionDialog] as a nested adaptive sheet,
/// reusing the same [onSave] callback as the history tab.
class SessionDetailSheet extends StatefulWidget {
  const SessionDetailSheet({
    required this.session,
    required this.categories,
    required this.onSave,
    required this.onDelete,
    this.thresholdDays,
    super.key,
  });

  final TimeTrackingSession session;
  final List<TimeTrackingCategory> categories;
  final int? thresholdDays;
  final Future<void> Function({
    String? title,
    String? description,
    String? categoryId,
    DateTime? startTime,
    DateTime? endTime,
  })
  onSave;

  /// Async delete handler. The sheet shows a loading indicator while awaiting
  /// this future, then shows a success toast and pops on completion.
  final Future<void> Function() onDelete;

  @override
  State<SessionDetailSheet> createState() => _SessionDetailSheetState();
}

class _SessionDetailSheetState extends State<SessionDetailSheet> {
  late TimeTrackingSession _session;

  @override
  void initState() {
    super.initState();
    _session = widget.session;
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;
    final dateFmt = DateFormat.yMMMd();
    final timeFmt = DateFormat.Hm();

    final startTime = _session.startTime;
    final endTime = _session.endTime;

    final categoryName = _resolvedCategoryName(l10n);
    final resolvedCategoryColor =
        _session.categoryColor ?? _categoryById(_session.categoryId)?.color;

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Handle bar
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: theme.colorScheme.mutedForeground.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const shad.Gap(16),

          // Header row: title + edit button
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  l10n.timerViewSessionDetails,
                  style: theme.typography.h3,
                ),
              ),
              shad.GhostButton(
                onPressed: () => _openEditDialog(context),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(shad.LucideIcons.pencil, size: 14),
                    const shad.Gap(4),
                    Text(
                      l10n.timerEditSession,
                      style: theme.typography.small,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const shad.Gap(16),

          Flexible(
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(bottom: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Session title
                  _DetailRow(
                    icon: shad.LucideIcons.tag,
                    label: l10n.timerSessionTitle,
                    value: _session.title?.isNotEmpty == true
                        ? _session.title!
                        : l10n.timerWorkSession,
                  ),
                  const shad.Gap(12),

                  // Category
                  _DetailRow(
                    icon: shad.LucideIcons.folder,
                    label: l10n.timerCategory,
                    value: categoryName,
                    colorDot: resolvedCategoryColor,
                  ),
                  const shad.Gap(12),

                  // Start time
                  if (startTime != null) ...[
                    _DetailRow(
                      icon: shad.LucideIcons.calendar,
                      label: l10n.timerStartTime,
                      value:
                          '${dateFmt.format(startTime.toLocal())}'
                          '  ${timeFmt.format(startTime.toLocal())}',
                    ),
                    const shad.Gap(12),
                  ],

                  // End time
                  if (endTime != null) ...[
                    _DetailRow(
                      icon: shad.LucideIcons.calendarCheck,
                      label: l10n.timerEndTime,
                      value:
                          '${dateFmt.format(endTime.toLocal())}'
                          '  ${timeFmt.format(endTime.toLocal())}',
                    ),
                    const shad.Gap(12),
                  ],

                  // Duration
                  _DetailRow(
                    icon: shad.LucideIcons.clock,
                    label: l10n.timerDuration,
                    value: _formatDuration(_session.duration, l10n),
                    valueBold: true,
                  ),

                  // Description (if present)
                  if (_session.description?.isNotEmpty == true) ...[
                    const shad.Gap(16),
                    const Divider(),
                    const shad.Gap(12),
                    Text(
                      l10n.timerDescription,
                      style: theme.typography.small.copyWith(
                        color: theme.colorScheme.mutedForeground,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const shad.Gap(6),
                    Text(
                      _session.description!,
                      style: theme.typography.base,
                    ),
                  ],
                ],
              ),
            ),
          ),

          const shad.Gap(24),
          const Divider(),
          const shad.Gap(12),

          // Delete button — opens confirmation dialog; loading lives there
          shad.DestructiveButton(
            onPressed: () => _showDeleteConfirmation(context),
            child: Row(
              children: [
                const Icon(shad.LucideIcons.trash2, size: 16),
                const shad.Gap(8),
                Text(l10n.timerDeleteSession),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Shows a confirmation dialog whose destructive button owns the
  /// loading indicator. The sheet stays fully interactive while the dialog
  /// is open; once the delete succeeds a success toast is shown on the
  /// sheet's context, and dialog/sheet dismissal is handled by the dialog.
  Future<void> _showDeleteConfirmation(BuildContext context) async {
    final l10n = context.l10n;

    await shad.showDialog<void>(
      context: context,
      builder: (dialogContext) => _DeleteConfirmationDialog(
        onConfirm: () async {
          await widget.onDelete();

          // Toast is shown on the sheet context (still mounted behind dialog).
          if (!context.mounted) return;
          shad.showToast(
            context: context,
            builder: (ctx, overlay) => shad.Alert(
              content: Text(ctx.l10n.timerSessionDeleted),
            ),
          );
        },
        title: l10n.timerDeleteSession,
        message: l10n.timerDeleteConfirm,
        cancelLabel: l10n.commonCancel,
        confirmLabel: l10n.timerDeleteSession,
      ),
    );
  }

  String _resolvedCategoryName(AppLocalizations l10n) {
    if (_session.categoryName?.isNotEmpty == true) {
      return _session.categoryName!;
    }
    return _categoryById(_session.categoryId)?.name ?? l10n.timerNoCategory;
  }

  TimeTrackingCategory? _categoryById(String? id) {
    if (id == null) return null;
    return widget.categories.where((c) => c.id == id).firstOrNull;
  }

  Future<void> _openEditDialog(BuildContext context) async {
    final sheetNavigator = Navigator.of(context);
    final updatedSession = await showAdaptiveSheet<TimeTrackingSession>(
      context: context,
      builder: (_) => EditSessionDialog(
        session: _session,
        categories: widget.categories,
        thresholdDays: widget.thresholdDays,
        onSave: widget.onSave,
      ),
    );

    if (!mounted || updatedSession == null) {
      return;
    }

    setState(() => _session = updatedSession);
    sheetNavigator.pop();
  }

  String _formatDuration(Duration d, AppLocalizations l10n) {
    if (d.isNegative) return l10n.timerInvalidDuration;
    final h = d.inHours;
    final m = d.inMinutes % 60;
    final s = d.inSeconds % 60;
    if (h > 0) return '${h}h ${m}m';
    if (m > 0) return '${m}m ${s}s';
    return '${s}s';
  }
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog with inline loading state
// ---------------------------------------------------------------------------

/// A confirmation dialog whose destructive confirm button shows a loading
/// spinner while [onConfirm] is in-flight. Errors are surfaced as a toast;
/// the dialog stays open so the user can retry or cancel.
class _DeleteConfirmationDialog extends StatefulWidget {
  const _DeleteConfirmationDialog({
    required this.onConfirm,
    required this.title,
    required this.message,
    required this.cancelLabel,
    required this.confirmLabel,
  });

  /// Async action to run when the user taps confirm. Should throw on failure.
  final Future<void> Function() onConfirm;
  final String title;
  final String message;
  final String cancelLabel;
  final String confirmLabel;

  @override
  State<_DeleteConfirmationDialog> createState() =>
      _DeleteConfirmationDialogState();
}

class _DeleteConfirmationDialogState extends State<_DeleteConfirmationDialog> {
  bool _isDeleting = false;

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.message),
          const shad.Gap(24),
          shad.OutlineButton(
            onPressed: _isDeleting ? null : () => Navigator.of(context).pop(),
            child: Text(widget.cancelLabel),
          ),
          const shad.Gap(8),
          shad.DestructiveButton(
            onPressed: _isDeleting ? null : _handleConfirm,
            child: _isDeleting
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: shad.CircularProgressIndicator(),
                  )
                : Text(widget.confirmLabel),
          ),
        ],
      ),
    );
  }

  Future<void> _handleConfirm() async {
    final navigator = Navigator.of(context);
    setState(() => _isDeleting = true);
    try {
      await widget.onConfirm();
      if (!mounted) return;
      navigator.pop();
      if (navigator.canPop()) {
        navigator.pop();
      }
    } on Exception catch (e, st) {
      debugPrint('_DeleteConfirmationDialog confirm failed: $e');
      debugPrintStack(stackTrace: st);
      if (!mounted) return;
      shad.showToast(
        context: context,
        builder: (ctx, overlay) => shad.Alert.destructive(
          title: Text(ctx.l10n.commonSomethingWentWrong),
          content: Text(ctx.l10n.commonSomethingWentWrong),
        ),
      );
      setState(() => _isDeleting = false);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
    this.colorDot,
    this.valueBold = false,
  });

  final IconData icon;
  final String label;
  final String value;

  /// When set, a small colored circle is shown inline before the value text,
  /// vertically centered with it.
  final String? colorDot;
  final bool valueBold;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final textStyle = valueBold
        ? theme.typography.base.copyWith(
            fontWeight: FontWeight.w600,
            fontFeatures: [const FontFeature.tabularFigures()],
          )
        : theme.typography.base;

    return Row(
      children: [
        Icon(
          icon,
          size: 16,
          color: theme.colorScheme.mutedForeground,
        ),
        const shad.Gap(10),
        SizedBox(
          width: 88,
          child: Text(
            label,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ),
        Expanded(
          child: Row(
            children: [
              if (colorDot != null) ...[
                _ColorDot(color: colorDot!),
                const shad.Gap(6),
              ],
              Expanded(
                child: Text(value, style: textStyle),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ColorDot extends StatelessWidget {
  const _ColorDot({required this.color});

  final String color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 10,
      height: 10,
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
