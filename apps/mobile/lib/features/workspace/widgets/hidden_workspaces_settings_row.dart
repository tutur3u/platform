import 'package:flutter/material.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

/// Restore entry for the Settings owner's workspace child surface.
class HiddenWorkspacesSettingsRow extends StatelessWidget {
  const HiddenWorkspacesSettingsRow({super.key});
  @override
  Widget build(BuildContext context) => Material(
    color: Colors.transparent,
    child: ListTile(
      leading: const Icon(Icons.visibility_off_outlined),
      title: Text(context.l10n.workspaceHiddenTitle),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => showWorkspacePickerSheet(context, hiddenOnly: true),
    ),
  );
}
