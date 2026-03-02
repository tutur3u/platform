import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class WorkspaceSelectorButton extends StatelessWidget {
  const WorkspaceSelectorButton({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return BlocBuilder<WorkspaceCubit, WorkspaceState>(
      buildWhen: (prev, curr) => prev.currentWorkspace != curr.currentWorkspace,
      builder: (context, state) {
        return shad.GhostButton(
          onPressed: () => showWorkspacePickerSheet(context),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 180),
                child: Text(
                  state.currentWorkspace?.name ?? l10n.appTitle,
                  overflow: TextOverflow.ellipsis,
                  softWrap: false,
                ),
              ),
              const shad.Gap(4),
              const Icon(Icons.arrow_drop_down, size: 20),
            ],
          ),
        );
      },
    );
  }
}
