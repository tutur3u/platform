import 'dart:async';

import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, OutlinedButton, TextField;
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class RequestReasonBox extends StatelessWidget {
  const RequestReasonBox({
    required this.text,
    required this.color,
    super.key,
  });

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: theme.typography.small.copyWith(color: color),
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
  final ValueChanged<String?> onReject;
  final ValueChanged<String?> onRequestInfo;

  @override
  State<RequestManagerActionsBar> createState() =>
      _RequestManagerActionsBarState();
}

class _RequestManagerActionsBarState extends State<RequestManagerActionsBar> {
  bool _isApproving = false;

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
                        onPressed: _isApproving ? null : _handleApprove,
                        child: _isApproving
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
                        onPressed: _isApproving
                            ? null
                            : () => _showReasonDialog(
                                context,
                                title: l10n.timerReject,
                                onSubmit: widget.onReject,
                              ),
                        child: Text(l10n.timerReject),
                      ),
                    ),
                  ],
                ),
                const shad.Gap(8),
                shad.OutlineButton(
                  onPressed: _isApproving
                      ? null
                      : () => _showReasonDialog(
                          context,
                          title: l10n.timerRequestInfo,
                          onSubmit: widget.onRequestInfo,
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
    setState(() => _isApproving = true);

    try {
      await widget.onApprove();
      if (!mounted) {
        return;
      }
      Navigator.of(context).pop();
    } on Exception catch (e) {
      if (!mounted) {
        return;
      }

      final message = e.toString().trim();
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        SnackBar(
          content: Text(
            message.isNotEmpty
                ? message
                : context.l10n.commonSomethingWentWrong,
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isApproving = false);
      }
    }
  }

  void _showReasonDialog(
    BuildContext context, {
    required String title,
    required ValueChanged<String?> onSubmit,
  }) {
    unawaited(
      shad.showDialog<void>(
        context: context,
        builder: (dialogCtx) => _ReasonDialogContent(
          title: title,
          onSubmit: (reason) {
            onSubmit(reason);
            Navigator.of(dialogCtx).pop();
            if (!mounted) {
              return;
            }
            Navigator.of(context).pop();
          },
        ),
      ),
    );
  }
}

class _ReasonDialogContent extends StatefulWidget {
  const _ReasonDialogContent({required this.title, required this.onSubmit});

  final String title;
  final ValueChanged<String?> onSubmit;

  @override
  State<_ReasonDialogContent> createState() => _ReasonDialogContentState();
}

class _ReasonDialogContentState extends State<_ReasonDialogContent> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      barrierColor: Colors.transparent,
      title: Text(widget.title),
      content: shad.TextField(
        controller: _controller,
        maxLines: 3,
        placeholder: Text(context.l10n.timerReasonOptional),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.profileCancel),
        ),
        shad.PrimaryButton(
          onPressed: () {
            final reason = _controller.text.trim();
            widget.onSubmit(reason.isEmpty ? null : reason);
          },
          child: Text(widget.title),
        ),
      ],
    );
  }
}
