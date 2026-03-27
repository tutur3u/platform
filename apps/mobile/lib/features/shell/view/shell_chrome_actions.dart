import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ShellChromeActions extends StatefulWidget {
  const ShellChromeActions({
    required this.ownerId,
    required this.locations,
    required this.actions,
    super.key,
  });

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
    final nextCubit = _findShellChromeActionsCubit(context);
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
        !listEquals(oldWidget.actions, widget.actions)) {
      _syncRegistration();
    }
  }

  void _syncRegistration() {
    _cubit?.register(
      registrationId: _registrationId,
      ownerId: widget.ownerId,
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
    super.key,
  });

  final String matchedLocation;

  @override
  State<ShellInjectedActionsHost> createState() =>
      _ShellInjectedActionsHostState();
}

class _ShellInjectedActionsHostState extends State<ShellInjectedActionsHost> {
  List<ShellActionSpec> _retainedActions = const <ShellActionSpec>[];
  String? _pendingClearLocation;

  void _scheduleClearRetainedActions(String matchedLocation) {
    if (_pendingClearLocation == matchedLocation) {
      return;
    }
    _pendingClearLocation = matchedLocation;
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
    final cubit = _findShellChromeActionsCubit(context);
    if (cubit == null) {
      return const SizedBox.shrink();
    }

    return BlocBuilder<ShellChromeActionsCubit, ShellChromeActionsState>(
      bloc: cubit,
      buildWhen: (previous, current) => !listEquals(
        previous.resolveForLocation(widget.matchedLocation),
        current.resolveForLocation(widget.matchedLocation),
      ),
      builder: (context, state) {
        final resolvedActions = state.resolveForLocation(
          widget.matchedLocation,
        );
        final actions = switch ((
          resolvedActions.isNotEmpty,
          _retainedActions.isNotEmpty,
        )) {
          (true, _) => resolvedActions,
          (false, true) => _retainedActions,
          (false, false) => resolvedActions,
        };

        if (resolvedActions.isNotEmpty) {
          _pendingClearLocation = null;
          _retainedActions = resolvedActions;
        } else if (_retainedActions.isNotEmpty) {
          _scheduleClearRetainedActions(widget.matchedLocation);
        }

        return AnimatedSize(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          alignment: Alignment.centerRight,
          child: actions.isEmpty
              ? const SizedBox(
                  key: ValueKey<String>('shell-actions-empty'),
                )
              : Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final action in actions)
                      Padding(
                        key: ValueKey<String>('shell-action-slot-${action.id}'),
                        padding: const EdgeInsets.only(right: 2),
                        child: _ShellActionButton(action: action),
                      ),
                  ],
                ),
        );
      },
    );
  }
}

ShellChromeActionsCubit? _findShellChromeActionsCubit(BuildContext context) {
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
                  child: CircularProgressIndicator(strokeWidth: 2),
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
