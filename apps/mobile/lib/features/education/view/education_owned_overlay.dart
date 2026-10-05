part of 'education_page.dart';

extension _EducationOwnedSheets on _EducationPageState {
  Future<T?> _showOwnedSheet<T>({
    required BuildContext context,
    required WidgetBuilder builder,
    bool isScrollControlled = false,
  }) => showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    builder: (context) =>
        _EducationOwnedOverlay(alive: _alive, child: builder(context)),
  );

  Future<T?> _showOwnedDialog<T>({
    required BuildContext context,
    required WidgetBuilder builder,
  }) => showDialog<T>(
    context: context,
    builder: (context) =>
        _EducationOwnedOverlay(alive: _alive, child: builder(context)),
  );
}

/// Remove only the route owned by the departed Education session, even when
/// another modal covers it. Never pop an unrelated account's navigation.
class _EducationOwnedOverlay extends StatefulWidget {
  const _EducationOwnedOverlay({required this.alive, required this.child});
  final ValueNotifier<bool> alive;
  final Widget child;
  @override
  State<_EducationOwnedOverlay> createState() => _EducationOwnedOverlayState();
}

class _EducationOwnedOverlayState extends State<_EducationOwnedOverlay> {
  @override
  void initState() {
    super.initState();
    widget.alive.addListener(_ownerChanged);
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
