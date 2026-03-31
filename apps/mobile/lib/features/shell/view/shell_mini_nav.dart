import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';

export 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart'
    show
        ShellMiniNavCubit,
        ShellMiniNavItemSpec,
        ShellMiniNavRegistration,
        ShellMiniNavState;

class ShellMiniNav extends StatefulWidget {
  const ShellMiniNav({
    required this.ownerId,
    required this.locations,
    required this.items,
    super.key,
    this.deepLinkBackRoute,
  });

  final String ownerId;
  final Set<String> locations;
  final List<ShellMiniNavItemSpec> items;
  final String? deepLinkBackRoute;

  @override
  State<ShellMiniNav> createState() => _ShellMiniNavState();
}

class _ShellMiniNavState extends State<ShellMiniNav> {
  ShellMiniNavCubit? _cubit;
  late final String _registrationId =
      '${widget.ownerId}#${identityHashCode(this)}';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final nextCubit = lookupShellMiniNavCubit(context);
    if (_cubit != nextCubit) {
      _cubit?.unregister(_registrationId);
      _cubit = nextCubit;
    }
    _syncRegistration();
  }

  @override
  void didUpdateWidget(covariant ShellMiniNav oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!setEquals(oldWidget.locations, widget.locations) ||
        oldWidget.ownerId != widget.ownerId ||
        oldWidget.deepLinkBackRoute != widget.deepLinkBackRoute ||
        !listEquals(oldWidget.items, widget.items)) {
      _syncRegistration();
    }
  }

  void _syncRegistration() {
    _cubit?.register(
      registrationId: _registrationId,
      ownerId: widget.ownerId,
      locations: widget.locations,
      items: widget.items,
      deepLinkBackRoute: widget.deepLinkBackRoute,
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

ShellMiniNavCubit? lookupShellMiniNavCubit(BuildContext context) {
  var hasProvider = false;
  context.visitAncestorElements((element) {
    if (element.widget is BlocProvider<ShellMiniNavCubit>) {
      hasProvider = true;
      return false;
    }
    return true;
  });
  if (!hasProvider) {
    return null;
  }

  return BlocProvider.of<ShellMiniNavCubit>(context);
}
