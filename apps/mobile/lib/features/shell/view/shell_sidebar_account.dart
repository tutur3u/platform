import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/view/account_presentation.dart';
import 'package:mobile/features/shell/view/shell_account_menu_items.dart';
import 'package:mobile/features/shell/view/shell_sidebar_geometry.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

export 'package:mobile/features/shell/view/shell_account_menu_items.dart'
    show shellAccountMenuHeaderKey;

/// The avatar account menu pinned to the bottom of the sidebar, as on web.
///
/// Enter, Space or a tap opens it; arrow keys move between items and into
/// the Language and Theme submenus, and Escape or Back closes it.
class ShellSidebarAccount extends StatefulWidget {
  const ShellSidebarAccount({
    required this.extended,
    required this.matchedLocation,
    required this.onProfileSelected,
    required this.includeWorkspacePicker,
    this.onNavigate,
    super.key,
  });

  final bool extended;
  final String matchedLocation;
  final VoidCallback onProfileSelected;
  final bool includeWorkspacePicker;

  /// Runs before a menu item leaves the current page.
  final VoidCallback? onNavigate;

  @override
  State<ShellSidebarAccount> createState() => _ShellSidebarAccountState();
}

class _ShellSidebarAccountState extends State<ShellSidebarAccount> {
  static int _nextId = 0;
  final String _ownerId = 'shell-account-menu#${_nextId++}';
  final _controller = MenuController();
  final _focus = FocusNode(debugLabel: 'Account menu');
  ShellChromeActionsCubit? _chrome;
  List<ShellActionSpec> _homeActions = const [];

  String get _registrationId => '$_ownerId/back';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _chrome = context.read<ShellChromeActionsCubit?>();
  }

  @override
  void dispose() {
    _unbindBack();
    _focus.dispose();
    super.dispose();
  }

  /// Back closes the open menu before it reaches the page beneath.
  void _bindBack() => _chrome?.register(
    registrationId: _registrationId,
    ownerId: _ownerId,
    locations: const {},
    actions: const [],
    modal: true,
    onBack: () async => _controller.close(),
  );

  void _unbindBack() {
    final chrome = _chrome;
    if (chrome != null && !chrome.isClosed) chrome.unregister(_registrationId);
  }

  void _toggle() =>
      _controller.isOpen ? _controller.close() : _controller.open();

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<ShellProfileCubit?>()?.state;
    final identity = context.select<AuthCubit?, AccountIdentity?>(
      (cubit) => cubit == null
          ? null
          : activeAccountIdentity(
              cubit.state,
              profile: profile?.profile,
              avatarUrl: profile?.avatarUrl,
            ),
    );
    final workspace = context.select<WorkspaceCubit?, Workspace?>(
      (cubit) => cubit?.state.currentWorkspace,
    );
    // Home publishes its account actions after the sidebar first builds.
    // The open menu's Back registration hides page actions, so the list
    // keeps the one resolved while the menu was closed.
    final chrome = _chrome;
    if (chrome != null) {
      final actions = context.select<ShellChromeActionsCubit, String>(
        (chrome) => [
          for (final action in shellHomeAccountActions(
            chrome,
            widget.matchedLocation,
          ))
            '${action.id}:${action.enabled}:${action.isLoading}',
        ].join('|'),
      );
      if (!_controller.isOpen || actions.isNotEmpty) {
        _homeActions = shellHomeAccountActions(
          chrome,
          widget.matchedLocation,
        ).toList();
      }
    }
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final extended = widget.extended;
    final subtitle =
        identity?.email ??
        (workspace == null ? null : displayWorkspaceName(context, workspace));
    final selected = widget.matchedLocation == Routes.profileRoot;
    final radius = tokens.interface.borderRadius(AppRadius.sm);
    // The docked sidebar opens the menu beside itself; the phone drawer
    // opens it above the avatar.
    final beside =
        shellNavigationModeFor(MediaQuery.sizeOf(context)) ==
        ShellNavigationMode.rail;
    final avatar = identity == null
        ? const Icon(LucideIcons.circleUserRound, size: 28)
        : AccountAvatar(identity: identity, size: 32);

    return SizedBox(
      width: extended ? double.infinity : 52,
      child: MenuAnchor(
        key: ValueKey(identity?.id),
        controller: _controller,
        childFocusNode: _focus,
        consumeOutsideTap: true,
        alignmentOffset: beside
            ? const Offset(AppSpacing.sm, 0)
            : const Offset(0, -AppSpacing.xs),
        style: MenuStyle(
          alignment: beside
              ? AlignmentDirectional.bottomEnd
              : AlignmentDirectional.topStart,
          backgroundColor: WidgetStatePropertyAll(colors.popover),
          surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
          minimumSize: const WidgetStatePropertyAll(Size(240, 0)),
          side: WidgetStatePropertyAll(BorderSide(color: colors.border)),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: radius),
          ),
        ),
        onOpen: _bindBack,
        onClose: _unbindBack,
        menuChildren: shellAccountMenuChildren(
          context,
          ShellAccountMenuData(
            identity: identity,
            profile: profile,
            matchedLocation: widget.matchedLocation,
            includeWorkspacePicker: widget.includeWorkspacePicker,
            onProfileSelected: widget.onProfileSelected,
            homeActions: _homeActions,
            onNavigate: widget.onNavigate,
          ),
        ),
        child: AppTooltip(
          message: l10n.authAccountsTitle,
          excludeFromSemantics: true,
          child: Semantics(
            button: true,
            selected: selected,
            label: l10n.authAccountsTitle,
            value: identity?.name,
            child: InkWell(
              focusNode: _focus,
              onTap: _toggle,
              borderRadius: radius,
              child: ExcludeSemantics(
                child: Ink(
                  decoration: BoxDecoration(
                    color: selected ? colors.muted : null,
                    borderRadius: radius,
                  ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 52),
                    child: extended
                        ? Padding(
                            padding: const EdgeInsets.all(AppSpacing.sm),
                            child: Row(
                              spacing: AppSpacing.sm,
                              children: [
                                avatar,
                                Expanded(
                                  child: _AccountLabel(
                                    name:
                                        identity?.name ??
                                        l10n.authAccountsTitle,
                                    subtitle: subtitle,
                                  ),
                                ),
                                const Icon(
                                  LucideIcons.chevronsUpDown,
                                  size: 16,
                                ),
                              ],
                            ),
                          )
                        : Center(child: avatar),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AccountLabel extends StatelessWidget {
  const _AccountLabel({required this.name, required this.subtitle});

  final String name;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final subtitle = this.subtitle;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: tokens.typography.ui.copyWith(fontWeight: FontWeight.w600),
        ),
        if (subtitle != null)
          Text(
            subtitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: tokens.typography.xSmall.copyWith(
              color: tokens.colorScheme.mutedForeground,
            ),
          ),
      ],
    );
  }
}
