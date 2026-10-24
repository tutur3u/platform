import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

/// Publishes an action only while its route visibly shares the shell.
class AssistantSettingsAction extends StatefulWidget {
  const AssistantSettingsAction({
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.isScopeCurrent,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final bool Function()? isScopeCurrent;

  @override
  State<AssistantSettingsAction> createState() =>
      _AssistantSettingsActionState();
}

class _AssistantSettingsActionState extends State<AssistantSettingsAction> {
  AppModalScope? _scope;
  ShellChromeActionsCubit? _pageChrome;
  String? _location;
  ModalRoute<dynamic>? _route;
  late final _registrationId =
      'assistant-settings-action#${identityHashCode(this)}';

  ShellChromeActionsCubit? get _chrome => _scope == null
      ? _pageChrome
      : _scope!.shellChromeVisible
      ? _scope!.chrome
      : null;

  bool get _active =>
      mounted &&
      (_route == null ||
          (_route!.isCurrent &&
              _route!.animation?.status != AnimationStatus.reverse &&
              _route!.animation?.status != AnimationStatus.dismissed)) &&
      (widget.isScopeCurrent?.call() ?? true);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = AppModalScope.maybeOf(context);
    final pageChrome = context.read<ShellChromeActionsCubit?>();
    if (next?.ownerId != _scope?.ownerId ||
        next?.chrome != _scope?.chrome ||
        next?.shellChromeVisible != _scope?.shellChromeVisible ||
        pageChrome != _pageChrome) {
      _unregister();
    }
    _scope = next;
    _pageChrome = pageChrome;
    final route = ModalRoute.of(context);
    _location = next != null || GoRouter.maybeOf(context) == null
        ? null
        : route?.settings is Page<dynamic>
        ? GoRouterState.of(context).matchedLocation
        : GoRouter.of(context).state.matchedLocation;
    if (route != _route) {
      _route?.animation?.removeStatusListener(_onStatus);
      _route = route;
      route?.animation?.addStatusListener(_onStatus);
    }
    _sync();
  }

  @override
  void didUpdateWidget(covariant AssistantSettingsAction oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync();
  }

  void _onStatus(AnimationStatus _) => _sync();

  void _unregister() {
    final chrome = _chrome;
    if (chrome != null && !chrome.isClosed) chrome.unregister(_registrationId);
  }

  void _invoke() {
    if (_active && !widget.loading) widget.onPressed?.call();
  }

  void _sync() {
    final scope = _scope;
    final chrome = _chrome;
    if (chrome == null || chrome.isClosed) return;
    if (!_active) {
      _unregister();
      return;
    }
    chrome.register(
      registrationId: _registrationId,
      ownerId: scope?.ownerId ?? _registrationId,
      locations: scope != null ? const {} : {if (_location != null) _location!},
      modal: scope != null,
      actions: [
        ShellActionSpec(
          id: _registrationId,
          icon: LucideIcons.check,
          tooltip: widget.label,
          inDock: true,
          keepVisibleWithKeyboard: true,
          highlighted: true,
          enabled: widget.onPressed != null && !widget.loading,
          isLoading: widget.loading,
          callbackToken: (widget.onPressed, widget.isScopeCurrent),
          onPressed: _invoke,
        ),
      ],
    );
  }

  @override
  void dispose() {
    _route?.animation?.removeStatusListener(_onStatus);
    _unregister();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _chrome != null
      ? const SizedBox.shrink()
      : AppButton.primary(
          onPressed: widget.onPressed != null && !widget.loading
              ? _invoke
              : null,
          child: Text(widget.label),
        );
}
