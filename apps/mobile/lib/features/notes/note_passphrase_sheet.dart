import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';

enum NoteLockMethod { device, pin, passphrase }

typedef NoteLockChoice = ({NoteLockMethod method, String? secret});

Future<NoteLockChoice?> showNoteLockSheet(
  BuildContext context, {
  required bool deviceAvailable,
  ValueChanged<BuildContext?>? onSheetContext,
  Future<void> Function()? onDismissed,
}) async {
  try {
    final result = await showAdaptiveSheet<NoteLockChoice>(
      context: context,
      maxDialogWidth: 420,
      builder: (sheetContext) {
        onSheetContext?.call(sheetContext);
        return _NoteLockSheet(deviceAvailable: deviceAvailable);
      },
    );
    if (result == null) await onDismissed?.call();
    return result;
  } finally {
    onSheetContext?.call(null);
  }
}

Future<String?> showNotePinSheet(
  BuildContext context, {
  ValueChanged<BuildContext?>? onSheetContext,
  Future<void> Function()? onDismissed,
}) async {
  try {
    final result = await showAdaptiveSheet<String>(
      context: context,
      maxDialogWidth: 420,
      builder: (sheetContext) {
        onSheetContext?.call(sheetContext);
        return const _NotePinSheet();
      },
    );
    if (result == null) await onDismissed?.call();
    return result;
  } finally {
    onSheetContext?.call(null);
  }
}

class _NoteLockSheet extends StatefulWidget {
  const _NoteLockSheet({required this.deviceAvailable});
  final bool deviceAvailable;

  @override
  State<_NoteLockSheet> createState() => _NoteLockSheetState();
}

class _NoteLockSheetState extends State<_NoteLockSheet> {
  late NoteLockMethod _method = widget.deviceAvailable
      ? NoteLockMethod.device
      : NoteLockMethod.pin;
  final _secret = TextEditingController();
  final _confirmation = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _secret.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  void _submit() {
    if (_method == NoteLockMethod.device) {
      Navigator.of(context).pop((method: _method, secret: null));
      return;
    }
    final valid = _method == NoteLockMethod.pin
        ? RegExp(r'^\d{6}$').hasMatch(_secret.text)
        : _secret.text.length >= 8;
    if (!valid || _secret.text != _confirmation.text) {
      setState(
        () => _error = _method == NoteLockMethod.pin
            ? context.l10n.notesPinRequirements
            : context.l10n.notesPassphraseRequirements,
      );
      return;
    }
    Navigator.of(context).pop((method: _method, secret: _secret.text));
  }

  void _selectMethod(NoteLockMethod method) {
    _secret.clear();
    _confirmation.clear();
    setState(() {
      _method = method;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) => AppDialogScaffold(
    title: context.l10n.notesLock,
    description: switch (_method) {
      NoteLockMethod.device => context.l10n.notesDeviceLockDescription,
      NoteLockMethod.pin => context.l10n.notesPinLockDescription,
      NoteLockMethod.passphrase => context.l10n.notesLockDescription,
    },
    icon: Icons.lock_outline_rounded,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_method != NoteLockMethod.device) ...[
          TextField(
            controller: _secret,
            autofocus: true,
            obscureText: true,
            keyboardType: _method == NoteLockMethod.pin
                ? TextInputType.number
                : TextInputType.text,
            inputFormatters: _method == NoteLockMethod.pin
                ? [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ]
                : null,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: _method == NoteLockMethod.pin
                  ? context.l10n.notesPin
                  : context.l10n.notesPassphrase,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _confirmation,
            obscureText: true,
            keyboardType: _method == NoteLockMethod.pin
                ? TextInputType.number
                : TextInputType.text,
            inputFormatters: _method == NoteLockMethod.pin
                ? [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ]
                : null,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(
              labelText: _method == NoteLockMethod.pin
                  ? context.l10n.notesConfirmPin
                  : context.l10n.notesConfirmPassphrase,
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
        FilledButton.icon(
          onPressed: _submit,
          icon: Icon(
            _method == NoteLockMethod.device
                ? Icons.fingerprint_rounded
                : Icons.lock_rounded,
          ),
          label: Text(context.l10n.notesLock),
        ),
        if (widget.deviceAvailable && _method != NoteLockMethod.device)
          TextButton(
            onPressed: () => _selectMethod(NoteLockMethod.device),
            child: Text(context.l10n.notesUseDeviceLock),
          ),
        if (_method != NoteLockMethod.pin)
          TextButton(
            onPressed: () => _selectMethod(NoteLockMethod.pin),
            child: Text(context.l10n.notesUsePin),
          ),
        if (_method != NoteLockMethod.passphrase)
          TextButton(
            onPressed: () => _selectMethod(NoteLockMethod.passphrase),
            child: Text(context.l10n.notesUsePassphrase),
          ),
      ],
    ),
  );
}

class _NotePinSheet extends StatefulWidget {
  const _NotePinSheet();

  @override
  State<_NotePinSheet> createState() => _NotePinSheetState();
}

class _NotePinSheetState extends State<_NotePinSheet> {
  final _pin = TextEditingController();

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  void _submit() {
    if (_pin.text.length == 6) Navigator.of(context).pop(_pin.text);
  }

  @override
  Widget build(BuildContext context) => AppDialogScaffold(
    title: context.l10n.notesOpenLocked,
    description: context.l10n.notesPinUnlockDescription,
    icon: Icons.lock_open_rounded,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _pin,
          autofocus: true,
          obscureText: true,
          keyboardType: TextInputType.number,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(6),
          ],
          textInputAction: TextInputAction.done,
          decoration: InputDecoration(labelText: context.l10n.notesPin),
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _submit,
          child: Text(context.l10n.notesOpenLocked),
        ),
      ],
    ),
  );
}

Future<String?> showNotePassphraseSheet(
  BuildContext context, {
  required bool create,
  ValueChanged<BuildContext?>? onSheetContext,
  Future<void> Function()? onDismissed,
}) async {
  try {
    final result = await showAdaptiveSheet<String>(
      context: context,
      maxDialogWidth: 420,
      builder: (sheetContext) {
        onSheetContext?.call(sheetContext);
        return _NotePassphraseSheet(create: create);
      },
    );
    if (result == null) await onDismissed?.call();
    return result;
  } finally {
    onSheetContext?.call(null);
  }
}

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
