import 'package:flutter/material.dart' hide Chip, CircleAvatar, Divider;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Shows a bottom sheet dialog for creating a new workspace.
Future<void> showCreateWorkspaceDialog(BuildContext context) async {
  final workspaceCubit = context.read<WorkspaceCubit>();

  await shad.openDrawer<void>(
    context: context,
    position: shad.OverlayPosition.bottom,
    builder: (context) {
      return BlocProvider<WorkspaceCubit>.value(
        value: workspaceCubit,
        child: const _CreateWorkspaceContent(),
      );
    },
  );
}

class _CreateWorkspaceContent extends StatefulWidget {
  const _CreateWorkspaceContent();

  @override
  State<_CreateWorkspaceContent> createState() =>
      _CreateWorkspaceContentState();
}

class _CreateWorkspaceContentState extends State<_CreateWorkspaceContent> {
  final _controller = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onSubmit() async {
    final name = _controller.text.trim();
    if (name.isEmpty) {
      setState(() => _error = context.l10n.workspaceCreateNameRequired);
      return;
    }

    setState(() => _error = null);

    try {
      final workspace = await context.read<WorkspaceCubit>().createWorkspace(
        name,
      );
      if (!mounted) return;

      // Close dialog
      await Navigator.maybePop(context);
      if (!mounted) return;

      // Auto-select the newly created workspace
      await context.read<WorkspaceCubit>().selectWorkspace(workspace);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } on Exception catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return BlocBuilder<WorkspaceCubit, WorkspaceState>(
      builder: (context, state) {
        final limits = state.limits;
        final canCreate = limits?.canCreate ?? true;

        // SingleChildScrollView prevents bottom overflow when keyboard opens
        return SingleChildScrollView(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(context).viewInsets.bottom + 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.workspaceCreateTitle,
                style: theme.typography.h3,
              ),
              const shad.Gap(4),
              if (limits != null && limits.limit > 0) ...[
                Text(
                  l10n.workspaceCreateLimitInfo(
                    limits.currentCount,
                    limits.limit,
                  ),
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
                const shad.Gap(4),
                shad.LinearProgressIndicator(
                  value: limits.currentCount / limits.limit,
                ),
              ],
              const shad.Gap(16),
              shad.TextField(
                controller: _controller,
                placeholder: Text(l10n.workspaceCreateNameHint),
                enabled: canCreate && !state.isCreating,
                onSubmitted: (_) => _onSubmit(),
              ),
              if (_error != null) ...[
                const shad.Gap(8),
                Text(
                  _error!,
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.destructive,
                  ),
                ),
              ],
              if (!canCreate) ...[
                const shad.Gap(8),
                Text(
                  l10n.workspaceCreateLimitReached,
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.destructive,
                  ),
                ),
              ],
              const shad.Gap(16),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  shad.OutlineButton(
                    onPressed: state.isCreating
                        ? null
                        : () => Navigator.maybePop(context),
                    child: Text(l10n.workspaceCreateCancel),
                  ),
                  const shad.Gap(8),
                  shad.PrimaryButton(
                    onPressed: (canCreate && !state.isCreating)
                        ? _onSubmit
                        : null,
                    child: state.isCreating
                        ? const shad.CircularProgressIndicator(size: 16)
                        : Text(l10n.workspaceCreateSubmit),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}
