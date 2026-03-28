import 'dart:async';

import 'package:flutter/material.dart'
    hide Chip, CircleAvatar, Divider, NavigationBar, NavigationBarTheme;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/create_workspace_dialog.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/features/workspace/widgets/workspace_tier_badge.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Shows a bottom drawer (compact) or dialog (medium+) for choosing either the
/// current workspace or the launch-default workspace.
enum WorkspacePickerMode { current, defaultWorkspace }

void showWorkspacePickerSheet(
  BuildContext parentContext, {
  WorkspacePickerMode mode = WorkspacePickerMode.current,
}) {
  final workspaceCubit = parentContext.read<WorkspaceCubit>();

  unawaited(
    showAdaptiveDrawer(
      context: parentContext,
      builder: (context) {
        return BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: BlocBuilder<WorkspaceCubit, WorkspaceState>(
            builder: (_, state) => _WorkspacePickerContent(
              parentContext: parentContext,
              workspaceCubit: workspaceCubit,
              state: state,
              mode: mode,
            ),
          ),
        );
      },
    ),
  );
}

class _WorkspacePickerContent extends StatelessWidget {
  const _WorkspacePickerContent({
    required this.parentContext,
    required this.workspaceCubit,
    required this.state,
    required this.mode,
  });

  final BuildContext parentContext;
  final WorkspaceCubit workspaceCubit;
  final WorkspaceState state;
  final WorkspacePickerMode mode;

  bool get _isDefaultMode => mode == WorkspacePickerMode.defaultWorkspace;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final sections = splitWorkspaceSections(state.workspaces);
    final maxHeight =
        MediaQuery.sizeOf(context).height * (context.isCompact ? 0.80 : 0.74);

    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          18,
          context.isCompact ? 10 : 20,
          18,
          context.isCompact ? 20 : 18,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _PickerHeader(
              title: _isDefaultMode
                  ? l10n.workspaceDefaultPickerTitle
                  : l10n.workspacePickerTitle,
              canCreate: state.limits?.canCreate ?? true,
              createLabel: l10n.workspaceCreateNew,
              onCreate: () => _handleCreate(context),
            ),
            if (state.limits != null && state.limits!.limit > 0) ...[
              const shad.Gap(14),
              _WorkspaceLimitsCard(
                currentCount: state.limits!.currentCount,
                limit: state.limits!.limit,
              ),
            ],
            const shad.Gap(16),
            if (sections.personal.isNotEmpty)
              _WorkspacePickerSection(
                title: l10n.workspacePersonalSection,
                children: [
                  for (final workspace in sections.personal)
                    _WorkspaceTile(
                      workspace: workspace,
                      isSelected: _isSelected(workspace),
                      isCurrent: workspace.id == state.currentWorkspace?.id,
                      isDefault: workspace.id == state.defaultWorkspace?.id,
                      onTap: () => _handleSelect(context, workspace),
                    ),
                ],
              ),
            if (sections.system.isNotEmpty) ...[
              if (sections.personal.isNotEmpty) const shad.Gap(16),
              _WorkspacePickerSection(
                title: l10n.workspaceSystemSection,
                children: [
                  for (final workspace in sections.system)
                    _WorkspaceTile(
                      workspace: workspace,
                      isSelected: _isSelected(workspace),
                      isCurrent: workspace.id == state.currentWorkspace?.id,
                      isDefault: workspace.id == state.defaultWorkspace?.id,
                      onTap: () => _handleSelect(context, workspace),
                    ),
                ],
              ),
            ],
            if (sections.team.isNotEmpty) ...[
              const shad.Gap(16),
              _WorkspacePickerSection(
                title: l10n.workspacePickerTitle,
                children: [
                  for (final workspace in sections.team)
                    _WorkspaceTile(
                      workspace: workspace,
                      isSelected: _isSelected(workspace),
                      isCurrent: workspace.id == state.currentWorkspace?.id,
                      isDefault: workspace.id == state.defaultWorkspace?.id,
                      onTap: () => _handleSelect(context, workspace),
                    ),
                ],
              ),
            ],
            if (state.workspaces.isEmpty) ...[
              const shad.Gap(16),
              _WorkspaceEmptyState(
                canCreate: state.limits?.canCreate ?? true,
                onCreate: () => _handleCreate(context),
              ),
            ],
          ],
        ),
      ),
    );
  }

  bool _isSelected(Workspace workspace) {
    return workspace.id ==
        (_isDefaultMode
            ? state.defaultWorkspace?.id
            : state.currentWorkspace?.id);
  }

  Future<void> _handleCreate(BuildContext context) async {
    if (!(state.limits?.canCreate ?? true)) {
      return;
    }

    await dismissAdaptiveDrawerOverlay(context);
    if (!parentContext.mounted) {
      return;
    }
    await showCreateWorkspaceDialog(parentContext);
  }

  Future<void> _handleSelect(BuildContext context, Workspace workspace) async {
    await dismissAdaptiveDrawerOverlay(context);

    if (_isDefaultMode) {
      await workspaceCubit.setDefaultWorkspace(workspace);
      return;
    }

    await workspaceCubit.selectWorkspace(workspace);
  }
}

class _PickerHeader extends StatelessWidget {
  const _PickerHeader({
    required this.title,
    required this.canCreate,
    required this.createLabel,
    required this.onCreate,
  });

  final String title;
  final bool canCreate;
  final String createLabel;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            title,
            style: theme.typography.h4.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const shad.Gap(12),
        Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: canCreate ? onCreate : null,
            child: Ink(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: canCreate
                    ? colorScheme.primary.withValues(alpha: 0.10)
                    : colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: canCreate
                      ? colorScheme.primary.withValues(alpha: 0.18)
                      : colorScheme.outlineVariant.withValues(alpha: 0.18),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.add_rounded,
                    size: 16,
                    color: canCreate
                        ? colorScheme.primary
                        : colorScheme.onSurfaceVariant,
                  ),
                  const shad.Gap(6),
                  Text(
                    createLabel,
                    style: theme.typography.small.copyWith(
                      color: canCreate
                          ? colorScheme.primary
                          : colorScheme.onSurfaceVariant,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _WorkspaceLimitsCard extends StatelessWidget {
  const _WorkspaceLimitsCard({
    required this.currentCount,
    required this.limit,
  });

  final int currentCount;
  final int limit;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.18),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    context.l10n.workspaceCreateLimitInfo(currentCount, limit),
                    style: theme.typography.small.copyWith(
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
                Text(
                  '$currentCount / $limit',
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const shad.Gap(10),
            shad.LinearProgressIndicator(value: currentCount / limit),
          ],
        ),
      ),
    );
  }
}

class _WorkspacePickerSection extends StatelessWidget {
  const _WorkspacePickerSection({
    required this.title,
    required this.children,
  });

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            title,
            style: theme.typography.small.copyWith(
              color: colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.3,
            ),
          ),
        ),
        const shad.Gap(10),
        DecoratedBox(
          decoration: BoxDecoration(
            color: colorScheme.surfaceContainerLow,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: colorScheme.outlineVariant.withValues(alpha: 0.18),
            ),
          ),
          child: Column(
            children: [
              for (var index = 0; index < children.length; index++) ...[
                if (index > 0)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Container(
                      height: 1,
                      color: colorScheme.outlineVariant.withValues(alpha: 0.18),
                    ),
                  ),
                children[index],
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _WorkspaceTile extends StatelessWidget {
  const _WorkspaceTile({
    required this.workspace,
    required this.isSelected,
    required this.isCurrent,
    required this.isDefault,
    required this.onTap,
  });

  final Workspace workspace;
  final bool isSelected;
  final bool isCurrent;
  final bool isDefault;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: isSelected
                ? colorScheme.primary.withValues(alpha: 0.08)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(22),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _WorkspaceLeading(workspace: workspace, size: 42),
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayWorkspaceName(context, workspace),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.large.copyWith(
                        fontWeight: isSelected
                            ? FontWeight.w700
                            : FontWeight.w600,
                      ),
                    ),
                    const shad.Gap(6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        WorkspaceTierBadge(tier: workspace.tier),
                        if (isCurrent)
                          _WorkspaceMetaChip(
                            label: context.l10n.workspaceCurrentBadge,
                          ),
                        if (isDefault)
                          _WorkspaceMetaChip(
                            label: context.l10n.workspaceDefaultBadge,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const shad.Gap(8),
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: isSelected
                      ? colorScheme.primary.withValues(alpha: 0.12)
                      : colorScheme.surfaceContainerHighest,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  isSelected
                      ? Icons.check_rounded
                      : Icons.chevron_right_rounded,
                  size: 16,
                  color: isSelected
                      ? colorScheme.primary
                      : colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WorkspaceLeading extends StatelessWidget {
  const _WorkspaceLeading({
    required this.workspace,
    required this.size,
  });

  final Workspace? workspace;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    if (workspace?.personal ?? false) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Icon(
          Icons.person_outline_rounded,
          size: size * 0.48,
          color: colorScheme.primary,
        ),
      );
    }

    if (workspace == null) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Icon(
          Icons.workspaces_outlined,
          size: size * 0.48,
          color: colorScheme.primary,
        ),
      );
    }

    return WorkspaceAvatar(workspace: workspace!, radius: size / 2);
  }
}

class _WorkspaceMetaChip extends StatelessWidget {
  const _WorkspaceMetaChip({
    required this.label,
  });

  final String label;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Text(
          label,
          style: theme.typography.xSmall.copyWith(
            color: colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _WorkspaceEmptyState extends StatelessWidget {
  const _WorkspaceEmptyState({
    required this.canCreate,
    required this.onCreate,
  });

  final bool canCreate;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.18),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              context.l10n.workspaceCreatePrompt,
              style: theme.typography.large.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const shad.Gap(6),
            Text(
              context.l10n.workspaceCreateDescription,
              style: theme.typography.small.copyWith(
                color: colorScheme.onSurfaceVariant,
              ),
            ),
            const shad.Gap(14),
            shad.PrimaryButton(
              onPressed: canCreate ? onCreate : null,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.add_rounded, size: 16),
                  const shad.Gap(6),
                  Text(context.l10n.workspaceCreateSubmit),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
