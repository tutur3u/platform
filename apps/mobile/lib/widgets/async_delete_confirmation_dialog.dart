import 'package:flutter/material.dart' hide AlertDialog;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AsyncDeleteConfirmationDialog extends StatefulWidget {
  const AsyncDeleteConfirmationDialog({
    required this.onConfirm,
    required this.title,
    required this.message,
    required this.cancelLabel,
    required this.confirmLabel,
    this.toastContext,
    this.maxWidth,
    super.key,
  });

  final Future<void> Function() onConfirm;
  final String title;
  final String message;
  final String cancelLabel;
  final String confirmLabel;
  final BuildContext? toastContext;
  final double? maxWidth;

  @override
  State<AsyncDeleteConfirmationDialog> createState() =>
      _AsyncDeleteConfirmationDialogState();
}

class _AsyncDeleteConfirmationDialogState
    extends State<AsyncDeleteConfirmationDialog> {
  bool _isDeleting = false;

  @override
  Widget build(BuildContext context) {
    return AppDialogScaffold(
      title: widget.title,
      description: widget.message,
      icon: Icons.delete_outline_rounded,
      maxWidth: widget.maxWidth ?? 420,
      maxHeightFactor: 0.56,
      actions: [
        shad.OutlineButton(
          onPressed: _isDeleting ? null : () => Navigator.of(context).pop(),
          child: Text(widget.cancelLabel),
        ),
        shad.DestructiveButton(
          onPressed: _isDeleting ? null : _handleConfirm,
          child: _isDeleting
              ? const SizedBox.square(
                  dimension: 16,
                  child: shad.CircularProgressIndicator(),
                )
              : Text(widget.confirmLabel),
        ),
      ],
      child: const SizedBox.shrink(),
    );
  }

  Future<void> _handleConfirm() async {
    final toastContext = widget.toastContext ?? context;
    setState(() => _isDeleting = true);
    try {
      await widget.onConfirm();
      if (!mounted) {
        return;
      }
      // Pop the dialog with true result
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) {
        return;
      }
      if (!toastContext.mounted) {
        setState(() => _isDeleting = false);
        return;
      }
      final message = e.message.trim().isEmpty
          ? toastContext.l10n.commonSomethingWentWrong
          : e.message;
      shad.showToast(
        context: toastContext,
        builder: (_, overlay) => shad.Alert.destructive(content: Text(message)),
      );
      setState(() => _isDeleting = false);
    } on Exception {
      if (!mounted) {
        return;
      }
      if (!toastContext.mounted) {
        setState(() => _isDeleting = false);
        return;
      }
      shad.showToast(
        context: toastContext,
        builder: (ctx, overlay) => shad.Alert.destructive(
          content: Text(ctx.l10n.commonSomethingWentWrong),
        ),
      );
      setState(() => _isDeleting = false);
    }
  }
}
