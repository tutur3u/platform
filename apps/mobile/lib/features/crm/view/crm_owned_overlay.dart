part of 'crm_page.dart';

extension _CrmOwnedSheets on _CrmPageState {
  Future<T?> _showOwnedSheet<T>({
    required BuildContext context,
    required WidgetBuilder builder,
  }) => showAppSheet<T>(
    context: context,
    builder: (context) =>
        _CrmOwnedOverlay(alive: _alive, child: builder(context)),
  );

  Future<T?> _showOwnedDialog<T>({
    required BuildContext context,
    required WidgetBuilder builder,
  }) => showAppDialog<T>(
    context: context,
    builder: (context) =>
        _CrmOwnedOverlay(alive: _alive, child: builder(context)),
  );
}

/// Remove only the route owned by the departed CRM session, including when
/// another modal covers it. Never pop an unrelated account's navigation.
class _CrmOwnedOverlay extends StatefulWidget {
  const _CrmOwnedOverlay({required this.alive, required this.child});
  final ValueNotifier<bool> alive;
  final Widget child;
  @override
  State<_CrmOwnedOverlay> createState() => _CrmOwnedOverlayState();
}

class _CrmOwnedOverlayState extends State<_CrmOwnedOverlay> {
  ModalRoute<Object?>? _route;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _route = ModalRoute.of(context);
  }

  @override
  void initState() {
    super.initState();
    widget.alive.addListener(_ownerChanged);
  }

  void _ownerChanged() {
    if (widget.alive.value || !mounted) return;
    final route = _route;
    if (route == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final navigator = route.navigator;
      if (route.isActive && navigator != null && navigator.mounted) {
        navigator.removeRoute(route);
      }
    });
  }

  @override
  void dispose() {
    widget.alive.removeListener(_ownerChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      widget.alive.value ? widget.child : const SizedBox.shrink();
}
