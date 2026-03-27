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

  ShellChromeActionsCubit? _maybeCubit(BuildContext context) {
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

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final nextCubit = _maybeCubit(context);
    if (_cubit != nextCubit) {
      _cubit?.unregister(widget.ownerId);
      _cubit = nextCubit;
    }
    _syncRegistration();
  }

  @override
  void didUpdateWidget(covariant ShellChromeActions oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.ownerId != widget.ownerId) {
      _cubit?.unregister(oldWidget.ownerId);
      _syncRegistration();
      return;
    }
    if (!setEquals(oldWidget.locations, widget.locations) ||
        !listEquals(oldWidget.actions, widget.actions)) {
      _syncRegistration();
    }
  }

  void _syncRegistration() {
    _cubit?.register(
      ownerId: widget.ownerId,
      locations: widget.locations,
      actions: widget.actions,
    );
  }

  @override
  void dispose() {
    _cubit?.unregister(widget.ownerId);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

class ShellInjectedActionsHost extends StatelessWidget {
  const ShellInjectedActionsHost({
    required this.matchedLocation,
    super.key,
  });

  final String matchedLocation;

  @override
  Widget build(BuildContext context) {
    final cubit = _findShellChromeActionsCubit(context);
    if (cubit == null) {
      return const SizedBox.shrink();
    }

    return BlocBuilder<ShellChromeActionsCubit, ShellChromeActionsState>(
      bloc: cubit,
      buildWhen: (previous, current) => !listEquals(
        previous.resolveForLocation(matchedLocation),
        current.resolveForLocation(matchedLocation),
      ),
      builder: (context, state) {
        final actions = state.resolveForLocation(matchedLocation);
        final actionIds = actions.map((action) => action.id).join('|');

        return AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          switchInCurve: Curves.easeOutCubic,
          switchOutCurve: Curves.easeInCubic,
          layoutBuilder: (currentChild, previousChildren) => Stack(
            alignment: Alignment.centerRight,
            children: [
              ...previousChildren,
              if (currentChild != null) currentChild,
            ],
          ),
          transitionBuilder: (child, animation) {
            final offsetAnimation = Tween<Offset>(
              begin: const Offset(0.08, 0),
              end: Offset.zero,
            ).animate(animation);
            return FadeTransition(
              opacity: animation,
              child: SlideTransition(position: offsetAnimation, child: child),
            );
          },
          child: actions.isEmpty
              ? const SizedBox(
                  key: ValueKey<String>('shell-actions-empty'),
                )
              : Row(
                  key: ValueKey<String>('shell-actions-$actionIds'),
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final action in actions)
                      Padding(
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

    final button = AnimatedOpacity(
      duration: const Duration(milliseconds: 180),
      opacity: action.enabled && !action.isLoading ? 1 : 0.6,
      child: shad.IconButton.ghost(
        onPressed: action.enabled && !action.isLoading
            ? action.onPressed
            : null,
        icon: iconChild,
      ),
    );

    if (action.tooltip == null || action.tooltip!.trim().isEmpty) {
      return button;
    }

    return Tooltip(message: action.tooltip, child: button);
  }
}
