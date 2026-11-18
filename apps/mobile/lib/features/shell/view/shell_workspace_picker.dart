import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/shell/view/shell_top_bar_button.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens the active-workspace picker from the shell header.
class ShellWorkspacePicker extends StatelessWidget {
  const ShellWorkspacePicker({super.key});

  @override
  Widget build(BuildContext context) {
    final workspace = context.select<WorkspaceCubit, Workspace?>(
      (cubit) => cubit.state.currentWorkspace,
    );
    final action = context.l10n.settingsSwitchWorkspace;
    final name = workspace == null
        ? null
        : displayWorkspaceNameOrFallback(context, workspace);
    void open() => showWorkspacePickerSheet(context);
    return Semantics(
      button: true,
      label: name ?? action,
      hint: name == null ? null : action,
      excludeSemantics: true,
      onTap: open,
      child: ShellTopBarButton(
        icon: workspace == null
            ? const Icon(LucideIcons.layers)
            : WorkspaceAvatar(workspace: workspace, radius: 16, circular: true),
        tooltip: name == null ? action : '$action · $name',
        onPressed: open,
      ),
    );
  }
}
