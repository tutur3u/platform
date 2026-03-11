import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

class WorkspaceSelectorButton extends StatelessWidget {
  const WorkspaceSelectorButton({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return BlocBuilder<WorkspaceCubit, WorkspaceState>(
      buildWhen: (prev, curr) => prev.currentWorkspace != curr.currentWorkspace,
      builder: (context, state) {
        final workspaceName = _displayWorkspaceName(
          state.currentWorkspace?.name ?? l10n.assistantPersonalWorkspace,
        );

        return Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: () => showWorkspacePickerSheet(context),
            child: Ink(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 132),
                    child: Text(
                      workspaceName,
                      overflow: TextOverflow.ellipsis,
                      softWrap: false,
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 2),
                  const Icon(Icons.keyboard_arrow_down_rounded, size: 18),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  String _displayWorkspaceName(String value) {
    if (value.toUpperCase() != value) return value;
    return value
        .toLowerCase()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
        .join(' ');
  }
}
