import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

class DocumentShareSheet extends StatefulWidget {
  const DocumentShareSheet({
    required this.isPublic,
    required this.onPublicChanged,
    required this.onDelete,
    super.key,
  });

  final bool isPublic;

  /// Applies the new visibility. Return false to revert the switch.
  final Future<bool> Function(bool value) onPublicChanged;
  final VoidCallback onDelete;

  @override
  State<DocumentShareSheet> createState() => _DocumentShareSheetState();
}

class _DocumentShareSheetState extends State<DocumentShareSheet> {
  late bool _isPublic = widget.isPublic;

  Future<void> _toggle(bool value) async {
    final previous = _isPublic;
    setState(() => _isPublic = value);
    final accepted = await widget.onPublicChanged(value);
    if (!accepted && mounted) setState(() => _isPublic = previous);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.documentsShare,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppToggleRow(
            title: Text(l10n.documentsPublic),
            subtitle: Text(
              _isPublic
                  ? l10n.documentsVisibilityPublic
                  : l10n.documentsVisibilityPrivate,
            ),
            value: _isPublic,
            onChanged: (value) => unawaited(_toggle(value)),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton.destructive(
            onPressed: widget.onDelete,
            leading: const Icon(LucideIcons.trash2),
            child: Text(l10n.documentsDelete),
          ),
        ],
      ),
    );
  }
}
