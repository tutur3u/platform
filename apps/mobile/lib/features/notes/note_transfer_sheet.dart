import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/features/notes/note_transfer.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

Future<NoteTransferPayload?> showNoteTransferSheet(
  BuildContext context, {
  required String wsId,
  required String noteId,
  ValueChanged<BuildContext?>? onSheetContext,
  Future<void> Function()? onDismissed,
}) async {
  try {
    final result = await showAdaptiveSheet<NoteTransferPayload>(
      context: context,
      maxDialogWidth: 420,
      builder: (sheetContext) {
        onSheetContext?.call(sheetContext);
        return _NoteTransferSheet(wsId: wsId, noteId: noteId);
      },
    );
    if (result == null) await onDismissed?.call();
    return result;
  } finally {
    onSheetContext?.call(null);
  }
}

class _NoteTransferSheet extends StatefulWidget {
  const _NoteTransferSheet({required this.wsId, required this.noteId});
  final String wsId;
  final String noteId;

  @override
  State<_NoteTransferSheet> createState() => _NoteTransferSheetState();
}

class _NoteTransferSheetState extends State<_NoteTransferSheet> {
  late final MobileScannerController _scanner = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
  );
  NoteTransferPayload? _payload;
  bool _invalid = false;

  @override
  void dispose() {
    unawaited(_scanner.dispose());
    super.dispose();
  }

  void _scan(BarcodeCapture capture) {
    if (_payload != null) return;
    for (final code in capture.barcodes) {
      final parsed = NoteTransferPayload.parse(
        code.rawValue,
        wsId: widget.wsId,
        noteId: widget.noteId,
      );
      if (parsed != null) {
        setState(() {
          _payload = parsed;
          _invalid = false;
        });
        unawaited(_scanner.stop());
        return;
      }
    }
    if (!_invalid) setState(() => _invalid = true);
  }

  @override
  Widget build(BuildContext context) => AppDialogScaffold(
    title: context.l10n.notesTransferTitle,
    description: _payload == null
        ? context.l10n.notesTransferScanDescription
        : context.l10n.notesTransferConfirmDescription(_payload!.origin.host),
    icon: Icons.qr_code_scanner_rounded,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_payload == null)
          SizedBox(
            height: 260,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: MobileScanner(controller: _scanner, onDetect: _scan),
            ),
          ),
        if (_invalid)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(context.l10n.notesTransferInvalidCode),
          ),
        if (_payload != null)
          FilledButton.icon(
            onPressed: () => Navigator.of(context).pop(_payload),
            icon: const Icon(Icons.lock_open_rounded),
            label: Text(context.l10n.notesTransferApprove),
          ),
      ],
    ),
  );
}
