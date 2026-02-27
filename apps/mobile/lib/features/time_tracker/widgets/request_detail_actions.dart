import 'dart:async';

import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, OutlinedButton, TextField;
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class RequestReasonBox extends StatelessWidget {
  const RequestReasonBox({
    required this.text,
    required this.color,
    required this.title,
    required this.icon,
    super.key,
  });

  final String text;
  final Color color;
  final String title;
  final IconData icon;
  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 12, color: color),
              const shad.Gap(8),
              Text(
                title,
                style: theme.typography.medium.copyWith(color: color),
              ),
            ],
          ),
          const shad.Gap(4),
          Text(
            text,
            style: theme.typography.small.copyWith(color: color),
          ),
        ],
      ),
    );
  }
}

class RequestManagerActionsBar extends StatefulWidget {
  const RequestManagerActionsBar({
    required this.onApprove,
    required this.onReject,
    required this.onRequestInfo,
    super.key,
  });

  final Future<void> Function() onApprove;
  final Future<void> Function(String?) onReject;
  final Future<void> Function(String) onRequestInfo;

  @override
  State<RequestManagerActionsBar> createState() =>
      _RequestManagerActionsBarState();
}

class _RequestManagerActionsBarState extends State<RequestManagerActionsBar> {
  bool _isProcessing = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const shad.Divider(),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: shad.PrimaryButton(
                        onPressed: _isProcessing ? null : _handleApprove,
                        child: _isProcessing
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: shad.CircularProgressIndicator(),
                              )
                            : Text(l10n.timerApprove),
                      ),
                    ),
                    const shad.Gap(8),
                    Expanded(
                      child: shad.DestructiveButton(
                        onPressed: _isProcessing
                            ? null
                            : () => _showReasonDialog(
                                context,
                                title: l10n.timerReject,
                                requiresText: false,
                                onSubmit: (reason) => widget.onReject(reason),
                              ),
                        child: Text(l10n.timerReject),
                      ),
                    ),
                  ],
                ),
                const shad.Gap(8),
                shad.OutlineButton(
                  onPressed: _isProcessing
                      ? null
                      : () => _showReasonDialog(
                          context,
                          title: l10n.timerRequestInfo,
                          requiresText: true,
                          onSubmit: (reason) => widget.onRequestInfo(reason!),
                        ),
                  child: Text(l10n.timerRequestInfo),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _handleApprove() async {
    setState(() => _isProcessing = true);

    try {
      await widget.onApprove();
      if (!mounted) {
        return;
      }

      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert(
          title: Text(context.l10n.timerRequestApproved),
        ),
      );

      Navigator.of(context).pop();
    } on Exception catch (e) {
      if (!mounted) {
        return;
      }

      final message = e.toString().trim();
      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(context.l10n.commonSomethingWentWrong),
          content: Text(
            message.isNotEmpty
                ? message
                : context.l10n.commonSomethingWentWrong,
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
      }
    }
  }

  void _showReasonDialog(
    BuildContext context, {
    required String title,
    required bool requiresText,
    required Future<void> Function(String?) onSubmit,
  }) {
    // Capture the root navigator state before opening the dialog.
    // shadcn_flutter's showToast uses InheritedTheme.capture which requires
    // the context to be an ancestor of the toast overlay. The dialog context
    // and sheet context sit *below* overlays in the widget tree, so they can
    // never satisfy that constraint. The root navigator context is always
    // above all overlays and is safe to use for toasts at any point.
    final rootNav = Navigator.of(context, rootNavigator: true);

    unawaited(
      shad.showDialog<void>(
        context: context,
        builder: (dialogCtx) => _ReasonDialogContent(
          title: title,
          requiresText: requiresText,
          onSubmit: (reason) async {
            // Capture root navigator context synchronously before any await.
            // Accessing BuildContext after an async gap is unsafe.
            final toastContext = rootNav.context;

            try {
              await onSubmit(reason);

              if (dialogCtx.mounted) {
                Navigator.of(dialogCtx).pop();
              }

              if (!toastContext.mounted) return;

              shad.showToast(
                context: toastContext,
                builder: (ctx, overlay) => shad.Alert(
                  title: Text(ctx.l10n.timerRequestUpdated),
                ),
              );
            } on Exception catch (e) {
              if (!toastContext.mounted) return;

              final message = e.toString().trim();
              shad.showToast(
                context: toastContext,
                builder: (ctx, overlay) => shad.Alert.destructive(
                  title: Text(ctx.l10n.commonSomethingWentWrong),
                  content: Text(
                    message.isNotEmpty
                        ? message
                        : ctx.l10n.commonSomethingWentWrong,
                  ),
                ),
              );
            }
          },
        ),
      ),
    );
  }
}

class _ReasonDialogContent extends StatefulWidget {
  const _ReasonDialogContent({
    required this.title,
    required this.requiresText,
    required this.onSubmit,
  });

  final String title;

  /// When true, the submit button is disabled until the text field has content,
  /// and the placeholder reflects that the field is required.
  final bool requiresText;

  final Future<void> Function(String?) onSubmit;

  @override
  State<_ReasonDialogContent> createState() => _ReasonDialogContentState();
}

class _ReasonDialogContentState extends State<_ReasonDialogContent> {
  late final TextEditingController _controller;
  bool _isSubmitting = false;
  bool _hasText = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
    _controller.addListener(_onTextChanged);
  }

  void _onTextChanged() {
    final hasText = _controller.text.trim().isNotEmpty;
    if (hasText != _hasText) {
      setState(() => _hasText = hasText);
    }
  }

  @override
  void dispose() {
    _controller
      ..removeListener(_onTextChanged)
      ..dispose();
    super.dispose();
  }

  bool get _canSubmit => !_isSubmitting && (!widget.requiresText || _hasText);

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final placeholder = widget.requiresText
        ? l10n.timerInfoRequired
        : l10n.timerReasonOptional;
    final submitLabel = widget.requiresText
        ? l10n.timerSubmitInfo
        : widget.title;

    return shad.AlertDialog(
      title: Text(widget.title),
      content: shad.TextField(
        controller: _controller,
        maxLines: 3,
        placeholder: Text(placeholder),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: _isSubmitting ? null : () => Navigator.of(context).pop(),
          child: Text(l10n.profileCancel),
        ),
        shad.PrimaryButton(
          onPressed: _canSubmit
              ? () async {
                  final reason = _controller.text.trim();
                  setState(() => _isSubmitting = true);
                  try {
                    await widget.onSubmit(reason.isEmpty ? null : reason);
                  } finally {
                    if (mounted) {
                      setState(() => _isSubmitting = false);
                    }
                  }
                }
              : null,
          child: _isSubmitting
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: shad.CircularProgressIndicator(),
                )
              : Text(submitLabel),
        ),
      ],
    );
  }
}
