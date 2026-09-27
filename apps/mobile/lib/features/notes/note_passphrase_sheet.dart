import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';

Future<String?> showNotePassphraseSheet(
  BuildContext context, {
  required bool create,
}) => showAdaptiveSheet<String>(
  context: context,
  maxDialogWidth: 420,
  builder: (_) => _NotePassphraseSheet(create: create),
);

class _NotePassphraseSheet extends StatefulWidget {
  const _NotePassphraseSheet({required this.create});
  final bool create;

  @override
  State<_NotePassphraseSheet> createState() => _NotePassphraseSheetState();
}

class _NotePassphraseSheetState extends State<_NotePassphraseSheet> {
  final _passphrase = TextEditingController();
  final _confirmation = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _passphrase.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  void _submit() {
    if (widget.create &&
        (_passphrase.text.length < 8 ||
            _passphrase.text != _confirmation.text)) {
      setState(() => _error = context.l10n.notesPassphraseRequirements);
      return;
    }
    if (_passphrase.text.isEmpty) return;
    Navigator.of(context).pop(_passphrase.text);
  }

  @override
  Widget build(BuildContext context) => AppDialogScaffold(
    title: widget.create
        ? context.l10n.notesLock
        : context.l10n.notesOpenLocked,
    description: widget.create
        ? context.l10n.notesLockDescription
        : context.l10n.notesUnlockDescription,
    icon: widget.create ? Icons.lock_outline_rounded : Icons.lock_open_rounded,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _passphrase,
          autofocus: true,
          obscureText: true,
          textInputAction: widget.create
              ? TextInputAction.next
              : TextInputAction.done,
          decoration: InputDecoration(labelText: context.l10n.notesPassphrase),
          onSubmitted: widget.create ? null : (_) => _submit(),
        ),
        if (widget.create) ...[
          const SizedBox(height: 12),
          TextField(
            controller: _confirmation,
            obscureText: true,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(
              labelText: context.l10n.notesConfirmPassphrase,
            ),
            onSubmitted: (_) => _submit(),
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(
            _error!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _submit,
          child: Text(
            widget.create
                ? context.l10n.notesLock
                : context.l10n.notesOpenLocked,
          ),
        ),
      ],
    ),
  );
}
