import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_text_field.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/l10n/l10n.dart';

/// The chat composer, published into the shell's floating dock (as Assistant
/// does), so there is no second dock or inner bar. Idle, the dock keeps its
/// navigation (which owns Back) and offers a compose button; composing, it
/// holds the text field, a close control and Send. Text only in M0; voice is
/// the OS keyboard's dictation.
class IrisComposer extends StatefulWidget {
  const IrisComposer({
    required this.onSend,
    this.enabled = true,
    this.location = Routes.mastermindInbox,
    super.key,
  });

  /// Returns whether the text was queued; the field clears only then.
  final bool Function(String text) onSend;

  /// False while the kill switch is on.
  final bool enabled;
  final String location;

  @override
  State<IrisComposer> createState() => IrisComposerState();
}

@visibleForTesting
class IrisComposerState extends State<IrisComposer> {
  final _text = TextEditingController();
  final _focus = FocusNode();
  bool _composing = false;

  @override
  void initState() {
    super.initState();
    _text.addListener(_changed);
  }

  @override
  void didUpdateWidget(IrisComposer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.enabled && _composing) _composing = false;
  }

  @override
  void dispose() {
    _text
      ..removeListener(_changed)
      ..dispose();
    _focus.dispose();
    super.dispose();
  }

  void _changed() => setState(() {});

  void _open() {
    setState(() => _composing = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  void _close() {
    _focus.unfocus();
    setState(() => _composing = false);
  }

  void _send() {
    if (widget.onSend(_text.text)) _text.clear();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final canSend = widget.enabled && _text.text.trim().isNotEmpty;
    return ShellDockPublisher(
      slot: ShellDockSlot(
        location: widget.location,
        composing: _composing,
        content: Row(
          children: [
            IconButton(
              tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
              onPressed: _close,
              icon: const Icon(AppIcons.close),
            ),
            Expanded(
              child: AppTextField(
                key: const ValueKey('iris-composer-field'),
                controller: _text,
                focusNode: _focus,
                placeholder: l10n.mastermindIrisComposerPlaceholder,
                borderless: true,
                enabled: widget.enabled,
                minLines: 1,
                maxLines: 4,
                keyboardType: TextInputType.multiline,
                textCapitalization: TextCapitalization.sentences,
                contentPadding: const EdgeInsets.symmetric(
                  vertical: AppSpacing.sm,
                ),
              ),
            ),
          ],
        ),
        primary: _composing
            ? IconButton(
                key: const ValueKey('iris-composer-send'),
                tooltip: l10n.mastermindIrisSend,
                onPressed: canSend ? _send : null,
                icon: const Icon(LucideIcons.sendHorizontal),
              )
            : IconButton(
                key: const ValueKey('iris-composer-open'),
                tooltip: l10n.mastermindIrisComposerPlaceholder,
                onPressed: widget.enabled ? _open : null,
                icon: const Icon(LucideIcons.messageSquarePlus),
              ),
      ),
    );
  }
}
