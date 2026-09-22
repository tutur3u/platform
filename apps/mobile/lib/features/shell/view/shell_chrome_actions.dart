import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/notifications/widgets/notifications_action_button.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ShellChromeActions extends StatefulWidget {
  const ShellChromeActions({
    required this.ownerId,
    required this.locations,
    required this.actions,
    this.immersive = false,
    super.key,
  });

  final bool immersive;
  final String ownerId;
  final Set<String> locations;
  final List<ShellActionSpec> actions;

  @override
  State<ShellChromeActions> createState() => _ShellChromeActionsState();
}

class _ShellChromeActionsState extends State<ShellChromeActions> {
  ShellChromeActionsCubit? _cubit;
  late final String _registrationId =
      '${widget.ownerId}#${identityHashCode(this)}';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final nextCubit = _lookupShellChromeActionsCubit(context);
    if (_cubit != nextCubit) {
      _cubit?.unregister(_registrationId);
      _cubit = nextCubit;
    }
    _syncRegistration();
  }

  @override
  void didUpdateWidget(covariant ShellChromeActions oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!setEquals(oldWidget.locations, widget.locations) ||
        oldWidget.ownerId != widget.ownerId ||
        oldWidget.immersive != widget.immersive ||
        !listEquals(oldWidget.actions, widget.actions)) {
      _syncRegistration();
    }
  }

  void _syncRegistration() {
    _cubit?.register(
      registrationId: _registrationId,
      ownerId: widget.ownerId,
      immersive: widget.immersive,
      locations: widget.locations,
      actions: widget.actions,
    );
  }

  @override
  void dispose() {
    _cubit?.unregister(_registrationId);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

class ShellInjectedActionsHost extends StatefulWidget {
  const ShellInjectedActionsHost({
    required this.matchedLocation,
    this.includeNotifications = false,
    super.key,
  });

  final String matchedLocation;
  final bool includeNotifications;

  @override
  State<ShellInjectedActionsHost> createState() =>
      _ShellInjectedActionsHostState();
}

class _ShellInjectedActionsHostState extends State<ShellInjectedActionsHost> {
  List<ShellActionSpec> _retainedActions = const <ShellActionSpec>[];
  String? _pendingClearLocation;

  @override
  void didUpdateWidget(covariant ShellInjectedActionsHost oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.matchedLocation == widget.matchedLocation) {
      return;
    }

    final cubit = _lookupShellChromeActionsCubit(context);
    if (cubit == null) {
      return;
    }
    _handleResolvedActions(
      cubit.state.resolveForLocation(widget.matchedLocation),
      widget.matchedLocation,
    );
  }

  void _handleResolvedActions(
    List<ShellActionSpec> resolvedActions,
    String matchedLocation,
  ) {
    if (resolvedActions.isNotEmpty) {
      final shouldUpdatePending = _pendingClearLocation != null;
      final shouldUpdateActions = !listEquals(
        _retainedActions,
        resolvedActions,
      );
      if (!shouldUpdatePending && !shouldUpdateActions) {
        return;
      }
      setState(() {
        _pendingClearLocation = null;
        _retainedActions = resolvedActions;
      });
      return;
    }

    if (_retainedActions.isNotEmpty) {
      _scheduleClearRetainedActions(matchedLocation);
    }
  }

  void _scheduleClearRetainedActions(String matchedLocation) {
    if (_pendingClearLocation == matchedLocation) {
      return;
    }
    setState(() {
      _pendingClearLocation = matchedLocation;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _pendingClearLocation != matchedLocation) {
        return;
      }
      setState(() {
        _pendingClearLocation = null;
        _retainedActions = const <ShellActionSpec>[];
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final cubit = _lookupShellChromeActionsCubit(context);
    if (cubit == null) {
      if (widget.includeNotifications &&
          shouldShowNotificationsActionForLocation(widget.matchedLocation)) {
        return ShellNotificationsActionSlot(
          matchedLocation: widget.matchedLocation,
        );
      }
      return const SizedBox.shrink();
    }

    return BlocConsumer<ShellChromeActionsCubit, ShellChromeActionsState>(
      bloc: cubit,
      listenWhen: (previous, current) => !listEquals(
        previous.resolveForLocation(widget.matchedLocation),
        current.resolveForLocation(widget.matchedLocation),
      ),
      listener: (context, state) {
        _handleResolvedActions(
          state.resolveForLocation(widget.matchedLocation),
          widget.matchedLocation,
        );
      },
      buildWhen: (previous, current) => !listEquals(
        previous.resolveForLocation(widget.matchedLocation),
        current.resolveForLocation(widget.matchedLocation),
      ),
      builder: (context, state) {
        final resolvedActions = state.resolveForLocation(
          widget.matchedLocation,
        );
        final resolvedPlacement = switch ((
          resolvedActions.isNotEmpty,
          _retainedActions.isNotEmpty,
        )) {
          (true, _) => resolvedActions,
          (false, true) => _retainedActions,
          (false, false) => resolvedActions,
        };
        final actions = resolvedPlacement
            .where((action) => !action.inDock)
            .toList();
        final showNotifications =
            widget.includeNotifications &&
            shouldShowNotificationsActionForLocation(widget.matchedLocation);
        final extraActionCount = actions.length + (showNotifications ? 1 : 0);

        if (extraActionCount > 3) {
          const visibleCount = 2;
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final action in actions.take(visibleCount))
                _ShellActionButton(action: action),
              if (actions.length > visibleCount || showNotifications)
                _ShellActionsOverflow(
                  actions: actions.skip(visibleCount).toList(),
                  showNotifications: showNotifications,
                ),
            ],
          );
        }

        return AnimatedSize(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          alignment: Alignment.centerRight,
          child: extraActionCount == 0
              ? const SizedBox(key: ValueKey<String>('shell-actions-empty'))
              : Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ..._groupedActionButtons(actions),
                    if (showNotifications)
                      ShellNotificationsActionSlot(
                        matchedLocation: widget.matchedLocation,
                      ),
                  ],
                ),
        );
      },
    );
  }
}

List<Widget> _groupedActionButtons(List<ShellActionSpec> actions) {
  final seen = <String>{};
  return [
    for (final action in actions)
      if (action.segmentGroup == null)
        _ShellActionButton(action: action)
      else if (seen.add(action.segmentGroup!))
        _ShellActionSegments(
          actions: actions
              .where((item) => item.segmentGroup == action.segmentGroup)
              .toList(),
        ),
  ];
}

class _ShellActionSegments extends StatelessWidget {
  const _ShellActionSegments({required this.actions});
  final List<ShellActionSpec> actions;

  @override
  Widget build(BuildContext context) {
    final colors = shad.Theme.of(context).colorScheme;
    return Container(
      key: ValueKey<String>(actions.first.segmentGroup!),
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final action in actions)
            Semantics(
              selected: action.highlighted,
              button: true,
              enabled: action.enabled,
              excludeSemantics: true,
              onTap: action.enabled ? action.onPressed : null,
              label: action.tooltip,
              child: Tooltip(
                message: action.tooltip ?? '',
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  decoration: BoxDecoration(
                    color: action.highlighted
                        ? colors.primary
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: IconButton(
                    constraints: const BoxConstraints(
                      minWidth: 40,
                      minHeight: 40,
                    ),
                    padding: const EdgeInsets.all(8),
                    style: IconButton.styleFrom(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    icon: Icon(
                      action.icon,
                      size: 20,
                      color: action.highlighted
                          ? colors.primaryForeground
                          : colors.mutedForeground,
                    ),
                    onPressed: action.enabled ? action.onPressed : null,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ShellActionsOverflow extends StatelessWidget {
  const _ShellActionsOverflow({
    required this.actions,
    required this.showNotifications,
  });

  static const _notificationsId = '__notifications__';

  final List<ShellActionSpec> actions;
  final bool showNotifications;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      key: const ValueKey<String>('shell-actions-overflow'),
      tooltip: MaterialLocalizations.of(context).showMenuTooltip,
      icon: const Icon(Icons.more_horiz_rounded, size: 22),
      onPressed: () async {
        final id = await showAdaptiveSheet<String>(
          context: context,
          builder: (sheetContext) => AppDialogScaffold(
            title: MaterialLocalizations.of(context).showMenuTooltip,
            child: Material(
              color: Colors.transparent,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final action in actions)
                    ListTile(
                      enabled: action.enabled && !action.isLoading,
                      leading: action.isLoading
                          ? const NovaLoadingIndicator(size: 20)
                          : Icon(action.icon),
                      title: Text(action.tooltip ?? action.id),
                      onTap: () => Navigator.of(sheetContext).pop(action.id),
                    ),
                  if (showNotifications)
                    ListTile(
                      leading: const Icon(Icons.notifications_none_rounded),
                      title: Text(context.l10n.notificationsTitle),
                      onTap: () =>
                          Navigator.of(sheetContext).pop(_notificationsId),
                    ),
                ],
              ),
            ),
          ),
        );
        if (!context.mounted || id == null) return;
        if (id == _notificationsId) {
          unawaited(context.push(Routes.notifications));
          return;
        }
        for (final action in actions) {
          if (action.id == id && action.enabled && !action.isLoading) {
            action.onPressed?.call();
            return;
          }
        }
      },
    );
  }
}

ShellChromeActionsCubit? _lookupShellChromeActionsCubit(BuildContext context) {
  var hasProvider = false;
  context.visitAncestorElements((element) {
    if (element.widget is BlocProvider<ShellChromeActionsCubit>) {
      hasProvider = true;
      return false;
    }
    return true;
  });
  if (!hasProvider) {
    return null;
  }

  return BlocProvider.of<ShellChromeActionsCubit>(context);
}

class _ShellActionButton extends StatelessWidget {
  const _ShellActionButton({required this.action});

  final ShellActionSpec action;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final iconColor = action.highlighted ? theme.colorScheme.primary : null;
    final iconChild = SizedBox.square(
      dimension: 18,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 180),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (child, animation) {
          return FadeTransition(opacity: animation, child: child);
        },
        child: action.isLoading
            ? const Center(
                key: ValueKey<String>('loading'),
                child: SizedBox.square(
                  dimension: 14,
                  child: NovaLoadingIndicator(size: 20),
                ),
              )
            : Icon(
                action.icon,
                key: ValueKey<String>('icon-${action.id}'),
                size: 18,
                color: iconColor,
              ),
      ),
    );

    final button = KeyedSubtree(
      key: ValueKey<String>('shell-action-button-${action.id}'),
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 180),
        opacity: action.enabled && !action.isLoading ? 1 : 0.6,
        child: shad.IconButton.ghost(
          onPressed: action.enabled && !action.isLoading
              ? action.onPressed
              : null,
          icon: iconChild,
        ),
      ),
    );

    if (action.tooltip == null || action.tooltip!.trim().isEmpty) {
      return button;
    }

    return Tooltip(message: action.tooltip, child: button);
  }
}
