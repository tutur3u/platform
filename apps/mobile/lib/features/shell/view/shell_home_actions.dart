import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/shell/view/shell_top_bar_button.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// The current workspace's 32dp round avatar, fully inside a 44dp hit box;
/// opens the workspace switcher.
class ShellWorkspaceAvatarButton extends StatelessWidget {
  const ShellWorkspaceAvatarButton({super.key});

  @override
  Widget build(BuildContext context) {
    final cubit = context.watch<WorkspaceCubit?>();
    if (cubit == null) return const SizedBox.shrink();
    return BlocBuilder<WorkspaceCubit, WorkspaceState>(
      bloc: cubit,
      buildWhen: (previous, current) =>
          previous.currentWorkspace != current.currentWorkspace,
      builder: (context, state) {
        final workspace =
            state.currentWorkspace ?? state.personalWorkspaceOrCurrent;
        if (workspace == null) return const SizedBox.shrink();
        final name = displayWorkspaceNameOrFallback(context, workspace);
        return Semantics(
          button: true,
          label: '${context.l10n.workspacePickerTitle}, $name',
          excludeSemantics: true,
          child: ShellTopBarButton(
            key: const ValueKey('shell-workspace-avatar'),
            icon: WorkspaceAvatar(
              workspace: workspace,
              radius: 16,
              circular: true,
            ),
            tooltip: name,
            onPressed: () => showWorkspacePickerSheet(context),
          ),
        );
      },
    );
  }
}
