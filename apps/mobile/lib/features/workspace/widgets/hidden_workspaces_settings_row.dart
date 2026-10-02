import 'package:flutter/material.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

/// Account-scoped restore entry, independent of the active workspace and role.
class HiddenWorkspacesSettingsRow extends StatelessWidget {
  const HiddenWorkspacesSettingsRow({this.grouped = false, super.key});

  final bool grouped;

  @override
  Widget build(BuildContext context) => SettingsTile(
    grouped: grouped,
    icon: Icons.visibility_off_outlined,
    title: context.l10n.workspaceHiddenTitle,
    onTap: () => showWorkspacePickerSheet(context, hiddenOnly: true),
  );
}
