import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/settings_route_frame.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// Settings routes publish chrome to the shell and inherit its safe areas.
class AssistantSettingsRouteFrame extends StatefulWidget {
  const AssistantSettingsRouteFrame({
    required this.title,
    required this.child,
    this.locations,
    super.key,
  });

  final String title;
  final Widget child;
  final Set<String>? locations;

  @override
  State<AssistantSettingsRouteFrame> createState() =>
      _AssistantSettingsRouteFrameState();
}

class _AssistantSettingsRouteFrameState
    extends State<AssistantSettingsRouteFrame> {
  ModalRoute<dynamic>? _route;
  bool _departing = false;
  late final _ownerId = 'assistant-settings#${identityHashCode(this)}';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (_route == route) return;
    _route?.animation?.removeStatusListener(_onStatus);
    _route = route;
    route?.animation?.addStatusListener(_onStatus);
  }

  void _onStatus(AnimationStatus status) {
    final departing =
        status == AnimationStatus.reverse ||
        status == AnimationStatus.dismissed;
    if (mounted && departing != _departing) {
      setState(() => _departing = departing);
    }
  }

  Future<void> _back() async {
    if (!mounted || _departing || _route?.isCurrent != true) return;
    final navigator = Navigator.of(context);
    if (navigator.canPop()) {
      await navigator.maybePop();
    } else {
      GoRouter.maybeOf(context)?.go(Routes.settings);
    }
  }

  @override
  void dispose() {
    _route?.animation?.removeStatusListener(_onStatus);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final chrome = context.read<ShellChromeActionsCubit?>();
    if (chrome == null) {
      return SettingsRouteFrame(
        title: widget.title,
        customNavigation: true,
        child: widget.child,
      );
    }
    final location = GoRouter.maybeOf(context) == null
        ? null
        : _route?.settings is Page<dynamic>
        ? GoRouterState.of(context).matchedLocation
        : GoRouter.of(context).state.matchedLocation;
    final locations = widget.locations ?? {if (location != null) location};
    return Stack(
      fit: StackFit.expand,
      children: [
        widget.child,
        if (!_departing) ...[
          ShellTitleOverride(
            ownerId: _ownerId,
            locations: locations,
            title: widget.title,
          ),
          ShellMiniNav(
            ownerId: _ownerId,
            locations: locations,
            deepLinkBackRoute: Routes.settings,
            items: [
              ShellMiniNavItemSpec(
                id: 'back',
                icon: LucideIcons.chevronLeft,
                label: context.l10n.navBack,
                onPressed: () => unawaited(_back()),
              ),
            ],
          ),
          ShellChromeActions(
            ownerId: _ownerId,
            locations: locations,
            actions: const [],
            onBack: _back,
          ),
        ],
      ],
    );
  }
}
