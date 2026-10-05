part of 'cms_page.dart';

extension _CmsOwnedSheets on _CmsPageState {
  Future<T?> _showCmsSheet<T>({
    required BuildContext context,
    required WidgetBuilder builder,
    required VoidCallback onDispose,
  }) => showAdaptiveSheet<T>(
    context: context,
    builder: (context) => _CmsOwnedOverlay(
      alive: _alive,
      child: _CmsEditorLifetime(onDispose: onDispose, child: builder(context)),
    ),
  );

  Future<T?> _showOwnedDialog<T>({
    required BuildContext context,
    required WidgetBuilder builder,
  }) => showDialog<T>(
    context: context,
    builder: (context) =>
        _CmsOwnedOverlay(alive: _alive, child: builder(context)),
  );
}

/// Remove only the route owned by the departed CMS session, including when
/// another modal covers it. Never pop an unrelated account's navigation.
class _CmsOwnedOverlay extends StatefulWidget {
  const _CmsOwnedOverlay({required this.alive, required this.child});
  final ValueNotifier<bool> alive;
  final Widget child;
  @override
  State<_CmsOwnedOverlay> createState() => _CmsOwnedOverlayState();
}

class _CmsOwnedOverlayState extends State<_CmsOwnedOverlay> {
  bool _listening = false;
  @override
  void initState() {
    super.initState();
    if (widget.alive.value) {
      widget.alive.addListener(_ownerChanged);
      _listening = true;
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!widget.alive.value) _ownerChanged();
  }

  void _ownerChanged() {
    if (widget.alive.value || !mounted) return;
    final route = ModalRoute.of(context);
    final navigator = Navigator.of(context);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (route != null && route.isActive && navigator.mounted) {
        navigator.removeRoute(route);
      }
    });
    // A covered route may be settled with no subsequent frame scheduled.
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  @override
  void dispose() {
    if (_listening) widget.alive.removeListener(_ownerChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      widget.alive.value ? widget.child : const SizedBox.shrink();
}

/// Modal futures resolve before their closing animation unmounts the fields.
/// Controllers therefore belong to the editor widget, not the awaiting caller.
class _CmsEditorLifetime extends StatefulWidget {
  const _CmsEditorLifetime({required this.child, required this.onDispose});
  final Widget child;
  final VoidCallback onDispose;
  @override
  State<_CmsEditorLifetime> createState() => _CmsEditorLifetimeState();
}

class _CmsEditorLifetimeState extends State<_CmsEditorLifetime> {
  @override
  void dispose() {
    widget.onDispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
