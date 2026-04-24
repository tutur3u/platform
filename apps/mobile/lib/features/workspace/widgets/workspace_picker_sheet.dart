import 'dart:async';

import 'package:flutter/material.dart'
    hide Chip, CircleAvatar, Divider, NavigationBar, NavigationBarTheme;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/apps/widgets/app_card_palette.dart';
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
    showAdaptiveSheet<void>(
      context: parentContext,
      useRootNavigator: true,
      builder: (context) => BlocProvider<WorkspaceCubit>.value(
        value: workspaceCubit,
        child: BlocBuilder<WorkspaceCubit, WorkspaceState>(
          builder: (_, state) => _WorkspacePickerContent(
            parentContext: parentContext,
            workspaceCubit: workspaceCubit,
            state: state,
            mode: mode,
          ),
        ),
      ),
    ),
  );
}

class _WorkspacePickerContent extends StatefulWidget {
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

  @override
  State<_WorkspacePickerContent> createState() =>
      _WorkspacePickerContentState();
}

class _WorkspacePickerContentState extends State<_WorkspacePickerContent> {
  late final TextEditingController _searchController;
  late final FocusNode _searchFocusNode;
  String _searchQuery = '';
  bool _isSearchVisible = false;

  bool get _isDefaultMode =>
      widget.mode == WorkspacePickerMode.defaultWorkspace;

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController()
      ..addListener(() {
        final nextQuery = _searchController.text;
        if (nextQuery == _searchQuery) return;
        setState(() {
          _searchQuery = nextQuery;
        });
      });
    _searchFocusNode = FocusNode()..addListener(_handleSearchFocusChanged);
  }

  @override
  void dispose() {
    _searchFocusNode.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final mediaPadding = MediaQuery.paddingOf(context);
    final visibleWorkspaces = _searchQuery.trim().isEmpty
        ? widget.state.workspaces
        : widget.state.workspaces
              .where((workspace) => _matchesWorkspace(context, workspace))
              .toList(growable: false);
    final sections = splitWorkspaceSections(visibleWorkspaces);
    final size = MediaQuery.sizeOf(context);

    return SizedBox(
      width: double.infinity,
      height: size.height - mediaPadding.top,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: theme.colorScheme.background,
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(context.isCompact ? 26 : 30),
          ),
          border: Border(
            top: BorderSide(
              color: theme.colorScheme.border.withValues(alpha: 0.55),
            ),
          ),
        ),
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            18,
            14,
            18,
            24 + mediaPadding.bottom,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _PickerHeader(
                title: _isDefaultMode
                    ? l10n.workspaceDefaultPickerTitle
                    : l10n.workspacePickerTitle,
                canCreate: widget.state.limits?.canCreate ?? true,
                createLabel: l10n.workspaceCreateNew,
                searchLabel: l10n.workspacePickerSearchHint,
                isSearchVisible: _isSearchVisible,
                searchController: _searchController,
                searchFocusNode: _searchFocusNode,
                onSearch: _toggleSearch,
                onClearSearch: _searchQuery.trim().isEmpty
                    ? null
                    : () => _searchController.clear(),
                onCreate: () => _handleCreate(context),
                onClose: () => Navigator.maybePop(context),
              ),
              const shad.Gap(16),
              if (widget.state.limits != null &&
                  widget.state.limits!.limit > 0) ...[
                _WorkspaceLimitsCard(
                  currentCount: widget.state.limits!.currentCount,
                  limit: widget.state.limits!.limit,
                ),
                const shad.Gap(16),
              ],
              if (sections.personal.isNotEmpty)
                _WorkspacePickerSection(
                  title: l10n.workspacePersonalSection,
                  paletteModuleId: 'crm',
                  children: [
                    for (final workspace in sections.personal)
                      _WorkspaceTile(
                        paletteModuleId: 'crm',
                        workspace: workspace,
                        isSelected: _isSelected(workspace),
                        isCurrent:
                            workspace.id == widget.state.currentWorkspace?.id,
                        isDefault:
                            workspace.id == widget.state.defaultWorkspace?.id,
                        onTap: () => _handleSelect(context, workspace),
                      ),
                  ],
                ),
              if (sections.system.isNotEmpty) ...[
                if (sections.personal.isNotEmpty) const shad.Gap(16),
                _WorkspacePickerSection(
                  title: l10n.workspaceSystemSection,
                  paletteModuleId: 'calendar',
                  children: [
                    for (final workspace in sections.system)
                      _WorkspaceTile(
                        paletteModuleId: 'calendar',
                        workspace: workspace,
                        isSelected: _isSelected(workspace),
                        isCurrent:
                            workspace.id == widget.state.currentWorkspace?.id,
                        isDefault:
                            workspace.id == widget.state.defaultWorkspace?.id,
                        onTap: () => _handleSelect(context, workspace),
                      ),
                  ],
                ),
              ],
              if (sections.team.isNotEmpty) ...[
                const shad.Gap(16),
                _WorkspacePickerSection(
                  title: l10n.workspacePickerTitle,
                  paletteModuleId: 'finance',
                  children: [
                    for (final workspace in sections.team)
                      _WorkspaceTile(
                        paletteModuleId: 'finance',
                        workspace: workspace,
                        isSelected: _isSelected(workspace),
                        isCurrent:
                            workspace.id == widget.state.currentWorkspace?.id,
                        isDefault:
                            workspace.id == widget.state.defaultWorkspace?.id,
                        onTap: () => _handleSelect(context, workspace),
                      ),
                  ],
                ),
              ],
              if (widget.state.workspaces.isEmpty)
                _WorkspaceEmptyState(
                  canCreate: widget.state.limits?.canCreate ?? true,
                  onCreate: () => _handleCreate(context),
                )
              else if (visibleWorkspaces.isEmpty)
                _WorkspaceSearchEmptyState(
                  onClear: () => _searchController.clear(),
                ),
            ],
          ),
        ),
      ),
    );
  }

  bool _matchesWorkspace(BuildContext context, Workspace workspace) {
    final query = _searchQuery.trim().toLowerCase();
    if (query.isEmpty) return true;

    return [
      displayWorkspacePickerName(context, workspace),
      workspace.name,
      workspace.id,
      workspace.tier,
    ].whereType<String>().any((value) => value.toLowerCase().contains(query));
  }

  bool _isSelected(Workspace workspace) {
    return workspace.id ==
        (_isDefaultMode
            ? widget.state.defaultWorkspace?.id
            : widget.state.currentWorkspace?.id);
  }

  void _toggleSearch() {
    if (_isSearchVisible) {
      _searchFocusNode.unfocus();
      return;
    }

    setState(() => _isSearchVisible = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _searchFocusNode.requestFocus();
    });
  }

  void _handleSearchFocusChanged() {
    if (!mounted) return;
    if (_searchFocusNode.hasFocus) {
      if (!_isSearchVisible) {
        setState(() => _isSearchVisible = true);
      }
      return;
    }

    if (_searchController.text.isNotEmpty) {
      _searchController.clear();
    }
    if (_isSearchVisible) {
      setState(() => _isSearchVisible = false);
    }
  }

  Future<void> _handleCreate(BuildContext context) async {
    if (!(widget.state.limits?.canCreate ?? true)) {
      return;
    }

    await Navigator.maybePop(context);
    if (!widget.parentContext.mounted) {
      return;
    }
    await showCreateWorkspaceDialog(widget.parentContext);
  }

  Future<void> _handleSelect(BuildContext context, Workspace workspace) async {
    await Navigator.maybePop(context);

    if (_isDefaultMode) {
      await widget.workspaceCubit.setDefaultWorkspace(workspace);
      return;
    }

    await widget.workspaceCubit.selectWorkspace(workspace);
  }
}

class _WorkspaceSearchField extends StatelessWidget {
  const _WorkspaceSearchField({
    required this.controller,
    required this.focusNode,
    required this.hintText,
    required this.onClear,
    super.key,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final String hintText;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    return shad.TextField(
      controller: controller,
      focusNode: focusNode,
      hintText: hintText,
      features: [
        const shad.InputFeature.leading(Icon(Icons.search_rounded, size: 18)),
        if (onClear != null)
          shad.InputFeature.trailing(
            shad.IconButton.ghost(
              icon: const Icon(Icons.close_rounded, size: 18),
              onPressed: onClear,
            ),
          ),
      ],
    );
  }
}

class _WorkspaceSearchEmptyState extends StatelessWidget {
  const _WorkspaceSearchEmptyState({required this.onClear});

  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.muted.withValues(alpha: 0.28),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.6),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            Icon(
              Icons.search_off_rounded,
              color: theme.colorScheme.mutedForeground,
            ),
            const shad.Gap(12),
            Expanded(
              child: Text(
                context.l10n.commonNoSearchResults,
                style: theme.typography.p.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            shad.OutlineButton(
              onPressed: onClear,
              child: Text(context.l10n.commonClearSearch),
            ),
          ],
        ),
      ),
    );
  }
}

class _PickerHeader extends StatelessWidget {
  const _PickerHeader({
    required this.title,
    required this.canCreate,
    required this.createLabel,
    required this.searchLabel,
    required this.isSearchVisible,
    required this.searchController,
    required this.searchFocusNode,
    required this.onSearch,
    required this.onClearSearch,
    required this.onCreate,
    required this.onClose,
  });

  final String title;
  final bool canCreate;
  final String createLabel;
  final String searchLabel;
  final bool isSearchVisible;
  final TextEditingController searchController;
  final FocusNode searchFocusNode;
  final VoidCallback onSearch;
  final VoidCallback? onClearSearch;
  final VoidCallback onCreate;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final palette = AppCardPalette.resolve(
      context,
      index: 0,
      moduleId: 'drive',
    );
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: palette.background,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.alphaBlend(
              palette.iconBackground.withValues(alpha: 0.28),
              palette.background,
            ),
            palette.background,
          ],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: palette.border.withValues(alpha: 0.95)),
        boxShadow: [
          BoxShadow(
            color: palette.shadow,
            blurRadius: 18,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.h4.copyWith(
                    color: palette.textColor,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const shad.Gap(10),
              _PickerHeaderIconButton(
                icon: Icons.close_rounded,
                color: palette.textColor,
                background: palette.background.withValues(alpha: 0.76),
                border: palette.border,
                onPressed: onClose,
              ),
            ],
          ),
          const shad.Gap(14),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            child: isSearchVisible
                ? _WorkspaceSearchField(
                    key: const ValueKey<String>('workspace-search-expanded'),
                    controller: searchController,
                    focusNode: searchFocusNode,
                    hintText: searchLabel,
                    onClear: onClearSearch,
                  )
                : Row(
                    key: const ValueKey<String>('workspace-search-collapsed'),
                    children: [
                      _PickerHeaderIconButton(
                        icon: Icons.search_rounded,
                        color: palette.iconColor,
                        background: palette.iconBackground,
                        border: palette.border,
                        onPressed: onSearch,
                      ),
                      const shad.Gap(10),
                      Expanded(
                        child: _PickerHeaderIconButton(
                          icon: Icons.add_rounded,
                          color: canCreate
                              ? palette.iconColor
                              : palette.iconColor.withValues(alpha: 0.48),
                          background: canCreate
                              ? palette.iconBackground
                              : palette.iconBackground.withValues(alpha: 0.62),
                          border: palette.border,
                          onPressed: canCreate ? onCreate : null,
                          label: createLabel,
                          centerContent: true,
                        ),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _PickerHeaderIconButton extends StatelessWidget {
  const _PickerHeaderIconButton({
    required this.icon,
    required this.color,
    required this.background,
    required this.border,
    required this.onPressed,
    this.label,
    this.centerContent = false,
  });

  final IconData icon;
  final Color color;
  final Color background;
  final Color border;
  final VoidCallback? onPressed;
  final String? label;
  final bool centerContent;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onPressed,
        child: Ink(
          height: 42,
          padding: EdgeInsets.symmetric(horizontal: label == null ? 10 : 12),
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: border.withValues(alpha: 0.44)),
          ),
          child: Row(
            mainAxisSize: centerContent ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: centerContent
                ? MainAxisAlignment.center
                : MainAxisAlignment.start,
            children: [
              Icon(icon, size: 19, color: color),
              if (label != null) ...[
                const shad.Gap(6),
                Flexible(
                  child: Text(
                    label!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.small.copyWith(
                      color: color,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
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
    final palette = AppCardPalette.resolve(
      context,
      index: 1,
      moduleId: 'finance',
    );
    final theme = shad.Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.background,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: palette.border.withValues(alpha: 0.9),
        ),
        boxShadow: [
          BoxShadow(
            color: palette.shadow,
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
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
                      color: palette.textColor.withValues(alpha: 0.78),
                    ),
                  ),
                ),
                Text(
                  '$currentCount / $limit',
                  style: theme.typography.small.copyWith(
                    color: palette.textColor,
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
    required this.paletteModuleId,
    required this.children,
  });

  final String title;
  final String paletteModuleId;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final palette = AppCardPalette.resolve(
      context,
      index: 0,
      moduleId: paletteModuleId,
    );
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            title,
            style: theme.typography.small.copyWith(
              color: palette.textColor.withValues(alpha: 0.74),
              fontWeight: FontWeight.w800,
              letterSpacing: 0.35,
            ),
          ),
        ),
        const shad.Gap(10),
        Column(
          children: [
            for (var index = 0; index < children.length; index++) ...[
              if (index > 0) const shad.Gap(10),
              children[index],
            ],
          ],
        ),
      ],
    );
  }
}

class _WorkspaceTile extends StatelessWidget {
  const _WorkspaceTile({
    required this.paletteModuleId,
    required this.workspace,
    required this.isSelected,
    required this.isCurrent,
    required this.isDefault,
    required this.onTap,
  });

  final String paletteModuleId;
  final Workspace workspace;
  final bool isSelected;
  final bool isCurrent;
  final bool isDefault;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = AppCardPalette.resolve(
      context,
      index: 0,
      moduleId: paletteModuleId,
    );
    final theme = shad.Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: isSelected
                ? palette.iconBackground.withValues(alpha: 0.9)
                : palette.background,
            gradient: isSelected
                ? LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      palette.iconBackground.withValues(alpha: 0.96),
                      palette.background,
                    ],
                  )
                : null,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isSelected
                  ? palette.border.withValues(alpha: 0.9)
                  : palette.border.withValues(alpha: 0.46),
            ),
            boxShadow: [
              BoxShadow(
                color: palette.shadow.withValues(
                  alpha: isSelected ? 0.84 : 0.5,
                ),
                blurRadius: isSelected ? 16 : 10,
                offset: const Offset(0, 7),
              ),
            ],
          ),
          child: Row(
            children: [
              _WorkspaceLeading(workspace: workspace, size: 46),
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayWorkspacePickerName(context, workspace),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.large.copyWith(
                        color: palette.textColor,
                        fontWeight: isSelected
                            ? FontWeight.w800
                            : FontWeight.w700,
                      ),
                    ),
                    const shad.Gap(6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        WorkspaceTierBadge(
                          tier: workspace.tier,
                          accentColorOverride: palette.iconColor,
                        ),
                        if (isCurrent)
                          _WorkspaceMetaChip(
                            palette: palette,
                            label: context.l10n.workspaceCurrentBadge,
                          ),
                        if (isDefault)
                          _WorkspaceMetaChip(
                            palette: palette,
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
                      ? palette.background
                      : palette.iconBackground,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: palette.border.withValues(
                      alpha: isSelected ? 0.55 : 0.36,
                    ),
                  ),
                ),
                child: Icon(
                  isSelected
                      ? Icons.check_rounded
                      : Icons.chevron_right_rounded,
                  size: 16,
                  color: isSelected
                      ? palette.iconColor
                      : palette.textColor.withValues(alpha: 0.72),
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

  final Workspace workspace;
  final double size;

  @override
  Widget build(BuildContext context) {
    return WorkspaceAvatar(workspace: workspace, radius: size / 2);
  }
}

class _WorkspaceMetaChip extends StatelessWidget {
  const _WorkspaceMetaChip({
    required this.palette,
    required this.label,
  });

  final AppCardPalette palette;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.iconBackground,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: palette.border.withValues(alpha: 0.36)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Text(
          label,
          style: theme.typography.xSmall.copyWith(
            color: palette.textColor.withValues(alpha: 0.8),
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
