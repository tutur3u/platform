import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_alert.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/overlays/app_dialog.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';

/// Confirms an action and runs it inside the dialog.
///
/// The dialog stays open while [onConfirm] runs, with both buttons locked and
/// the confirm button showing progress. A failure keeps it open and shows
/// [describeError]'s message inline so the user can retry or cancel. Resolves
/// `true` only after [onConfirm] completes.
Future<bool> showAppAsyncConfirmDialog({
  required BuildContext context,
  required String title,
  required String confirmLabel,
  required String cancelLabel,
  required Future<void> Function() onConfirm,
  required String Function(Object error) describeError,
  String? message,
  bool destructive = true,
}) async {
  final confirmed = await showAppDialog<bool>(
    context: context,
    builder: (_) => AppAsyncConfirmDialog(
      title: title,
      message: message,
      confirmLabel: confirmLabel,
      cancelLabel: cancelLabel,
      destructive: destructive,
      onConfirm: onConfirm,
      describeError: describeError,
    ),
  );
  return confirmed ?? false;
}

/// Body of [showAppAsyncConfirmDialog].
class AppAsyncConfirmDialog extends StatefulWidget {
  const AppAsyncConfirmDialog({
    required this.title,
    required this.confirmLabel,
    required this.cancelLabel,
    required this.onConfirm,
    required this.describeError,
    this.message,
    this.destructive = true,
    super.key,
  });

  final String title;
  final String? message;
  final String confirmLabel;
  final String cancelLabel;
  final bool destructive;
  final Future<void> Function() onConfirm;
  final String Function(Object error) describeError;

  @override
  State<AppAsyncConfirmDialog> createState() => _AppAsyncConfirmDialogState();
}

class _AppAsyncConfirmDialogState extends State<AppAsyncConfirmDialog> {
  bool _running = false;
  String? _error;

  Future<void> _confirm() async {
    setState(() {
      _running = true;
      _error = null;
    });
    try {
      await widget.onConfirm();
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _running = false;
        _error = widget.describeError(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final message = widget.message;
    final error = _error;
    return PopScope(
      canPop: !_running,
      child: AppDialog(
        title: widget.title,
        content: message == null && error == null
            ? null
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (message != null) Text(message),
                  if (error != null) ...[
                    if (message != null) const SizedBox(height: 12),
                    AppAlert.destructive(content: Text(error)),
                  ],
                ],
              ),
        actions: [
          AppButton.ghost(
            onPressed: _running ? null : () => Navigator.of(context).pop(false),
            child: Text(widget.cancelLabel),
          ),
          AppButton(
            key: const ValueKey('app-async-confirm'),
            variant: widget.destructive
                ? AppButtonVariant.destructive
                : AppButtonVariant.primary,
            loading: _running,
            onPressed: _running ? null : () => unawaited(_confirm()),
            child: Text(widget.confirmLabel),
          ),
        ],
      ),
    );
  }
}
