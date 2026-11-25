import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/view/account_presentation.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_top_bar_button.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

/// Key of the phone sidebar drawer's panel.
const shellSidebarDrawerKey = ValueKey<String>('shell-sidebar-drawer');

/// Key of the top-bar avatar that opens the phone sidebar drawer.
const shellSidebarDrawerButtonKey = ValueKey<String>(
  'shell-sidebar-drawer-button',
);

/// Widest the phone drawer opens, matching the expanded sidebar.
const double shellSidebarDrawerMaxWidth = 320;

/// Narrowest window whose top bar has room for the drawer's avatar beside
/// the page actions and workspace picker. Narrower phones reach the same
/// destinations from the dock and the account from the Profile tab.
const double shellSidebarDrawerMinWindowWidth = 360;

/// Publishes the phone sidebar so the top bar can open it as a drawer.
///
/// [buildDrawer] builds the expanded sidebar; it receives the callback
/// that closes the drawer. It is null where the sidebar is already docked.
class ShellSidebarDrawerScope extends InheritedWidget {
  const ShellSidebarDrawerScope({
    required this.buildDrawer,
    required super.child,
    super.key,
  });

  final Widget Function(VoidCallback dismiss)? buildDrawer;

  static ShellSidebarDrawerScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ShellSidebarDrawerScope>();

  @override
  bool updateShouldNotify(ShellSidebarDrawerScope oldWidget) =>
      (buildDrawer == null) != (oldWidget.buildDrawer == null);
}

/// Opens the phone sidebar from the leading edge. Back, the scrim, a
/// destination or a workspace switch closes it.
Future<void> showShellSidebarDrawer(BuildContext context) async {
  final build = ShellSidebarDrawerScope.maybeOf(context)?.buildDrawer;
  if (build == null) return;
  final workspace = context.read<WorkspaceCubit?>();
  final reduceMotion = MediaQuery.disableAnimationsOf(context);
  await showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: Colors.black.withValues(alpha: 0.48),
    transitionDuration: reduceMotion
        ? Duration.zero
        : const Duration(milliseconds: 220),
    pageBuilder: (dialogContext, _, _) =>
        _ShellSidebarDrawer(builder: build, workspace: workspace),
    transitionBuilder: (context, animation, _, child) {
      final curved = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      );
      final rtl = Directionality.of(context) == TextDirection.rtl;
      return SlideTransition(
        position: Tween<Offset>(
          begin: Offset(rtl ? 1 : -1, 0),
          end: Offset.zero,
        ).animate(curved),
        child: child,
      );
    },
  );
}

class _ShellSidebarDrawer extends StatelessWidget {
  const _ShellSidebarDrawer({required this.builder, required this.workspace});

  final Widget Function(VoidCallback dismiss) builder;
  final WorkspaceCubit? workspace;

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    final width = math.min(
      shellSidebarDrawerMaxWidth,
      MediaQuery.sizeOf(context).width * 0.85,
    );
    void dismiss() {
      final route = ModalRoute.of(context);
      if (route == null || !route.isActive) return;
      // A sheet or dialog opened from the drawer may still sit above it.
      if (route.isCurrent) {
        Navigator.of(context).pop();
      } else {
        Navigator.of(context).removeRoute(route);
      }
    }

    Widget panel = Align(
      alignment: AlignmentDirectional.centerStart,
      child: SizedBox(
        key: shellSidebarDrawerKey,
        width: width,
        height: double.infinity,
        child: Material(
          color: style.page,
          elevation: 8,
          child: AppModalBinding(child: builder(dismiss)),
        ),
      ),
    );
    final workspace = this.workspace;
    if (workspace != null) {
      // A new workspace changes every destination, so the drawer closes.
      panel = BlocListener<WorkspaceCubit, WorkspaceState>(
        bloc: workspace,
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (_, _) => dismiss(),
        child: panel,
      );
    }
    return panel;
  }
}

/// The signed-in avatar in the phone top bar; it opens the sidebar drawer
/// with destinations, the workspace switcher and the account menu. It shows
/// from [shellSidebarDrawerMinWindowWidth] on root pages without header
/// actions of their own, except Mira.
class ShellSidebarDrawerButton extends StatelessWidget {
  const ShellSidebarDrawerButton({required this.matchedLocation, super.key});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) {
    final scope = ShellSidebarDrawerScope.maybeOf(context);
    // Mira's mode title fills its bar.
    if (scope?.buildDrawer == null ||
        matchedLocation.startsWith(Routes.assistant) ||
        MediaQuery.sizeOf(context).width < shellSidebarDrawerMinWindowWidth) {
      return const SizedBox.shrink();
    }
    // A page's own header actions keep their room beside its title.
    // A nullable select would not subscribe, so it runs only with a cubit.
    final pageActions =
        context.read<ShellChromeActionsCubit?>() != null &&
        context.select<ShellChromeActionsCubit, bool>(
          (chrome) => chrome.state
              .resolveForLocation(matchedLocation)
              .any((action) => !isShellSidebarAction(action)),
        );
    if (pageActions) return const SizedBox.shrink();
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
    final label = context.l10n.appearanceSidebarOpen;
    return Semantics(
      button: true,
      label: label,
      value: identity?.name,
      excludeSemantics: true,
      child: ShellTopBarButton(
        key: shellSidebarDrawerButtonKey,
        icon: identity == null
            ? const Icon(LucideIcons.panelLeft)
            : AccountAvatar(identity: identity, size: 28),
        tooltip: label,
        onPressed: () {
          unawaited(AppHaptics.selection());
          unawaited(showShellSidebarDrawer(context));
        },
      ),
    );
  }
}
