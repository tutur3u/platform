import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/l10n/l10n.dart';

/// A personal-name draft. Success closes the editor without claiming
/// offline synchronization.
class AssistantNameDialog extends StatefulWidget {
  const AssistantNameDialog({
    required this.name,
    required this.onSubmit,
    required this.isCurrent,
    required this.scopeChanges,
    super.key,
  });
  final String name;
  final Future<void> Function(String) onSubmit;
  final bool Function() isCurrent;
  final Stream<Object?> scopeChanges;
  @override
  State<AssistantNameDialog> createState() => _AssistantNameDialogState();
}

class _AssistantNameDialogState extends State<AssistantNameDialog> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.name,
  );
  final _focus = FocusNode();
  StreamSubscription<Object?>? _scopeSubscription;
  bool _busy = false;
  bool _failed = false;
  bool _expired = false;
  @override
  void initState() {
    super.initState();
    _scopeSubscription = widget.scopeChanges.listen((_) {
      if (!mounted || widget.isCurrent()) return;
      _expired = true;
      _controller.clear();
      _focus.unfocus();
      setState(() {});
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final route = ModalRoute.of(context);
        if (route != null && route.isActive) {
          Navigator.of(context).removeRoute(route);
        }
      });
    });
  }

  @override
  void dispose() {
    unawaited(_scopeSubscription?.cancel());
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy || _expired || !widget.isCurrent()) return;
    final name = _controller.text.trim();
    if (name.isEmpty || name.length > 50) return;
    if (name == widget.name) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      await widget.onSubmit(name);
      if (!mounted || _expired || !widget.isCurrent()) return;
      Navigator.of(context).pop();
    } on Object {
      if (!mounted || _expired || !widget.isCurrent()) return;
      setState(() {
        _busy = false;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_expired) return const SizedBox.shrink();
    return AlertDialog(
      title: Text(context.l10n.assistantRenameTitle),
      scrollable: true,
      content: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              key: const ValueKey('assistant-name-input'),
              controller: _controller,
              focusNode: _focus,
              autofocus: true,
              enabled: !_busy,
              maxLength: 50,
              textInputAction: TextInputAction.done,
              contextMenuBuilder: platformTextContextMenuBuilder(),
              selectionControls: platformTextSelectionControls(),
              decoration: InputDecoration(
                labelText: context.l10n.assistantRenameLabel,
              ),
              onChanged: (_) => setState(() => _failed = false),
              onSubmitted: (_) => unawaited(_save()),
            ),
            if (_failed)
              Text(
                context.l10n.assistantRenameError,
                key: const ValueKey('assistant-name-error'),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
        TextButton(
          key: const ValueKey('assistant-name-save'),
          onPressed: _busy || _controller.text.trim().isEmpty
              ? null
              : () => unawaited(_save()),
          child: Text(context.l10n.commonSave),
        ),
      ],
    );
  }
}
