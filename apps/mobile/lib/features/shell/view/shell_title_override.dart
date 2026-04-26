import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';

class ShellTitleOverride extends StatefulWidget {
  const ShellTitleOverride({
    required this.ownerId,
    required this.locations,
    required this.title,
    super.key,
    this.showLeadingBrand = true,
    this.showAvatar = true,
    this.onTitleSubmitted,
  });

  final String ownerId;
  final Set<String> locations;
  final String title;
  final bool showLeadingBrand;
  final bool showAvatar;
  final Future<void> Function(String title)? onTitleSubmitted;

  @override
  State<ShellTitleOverride> createState() => _ShellTitleOverrideState();
}

class _ShellTitleOverrideState extends State<ShellTitleOverride> {
  ShellTitleOverrideCubit? _cubit;
  late final String _registrationId =
      '${widget.ownerId}#${identityHashCode(this)}';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final nextCubit = lookupShellTitleOverrideCubit(context);
    if (_cubit != nextCubit) {
      _cubit?.unregister(_registrationId);
      _cubit = nextCubit;
    }
    _syncRegistration();
  }

  @override
  void didUpdateWidget(covariant ShellTitleOverride oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!setEquals(oldWidget.locations, widget.locations) ||
        oldWidget.ownerId != widget.ownerId ||
        oldWidget.title != widget.title ||
        oldWidget.showLeadingBrand != widget.showLeadingBrand ||
        oldWidget.showAvatar != widget.showAvatar ||
        oldWidget.onTitleSubmitted != widget.onTitleSubmitted) {
      _syncRegistration();
    }
  }

  void _syncRegistration() {
    _cubit?.register(
      registrationId: _registrationId,
      ownerId: widget.ownerId,
      locations: widget.locations,
      title: widget.title,
      showLeadingBrand: widget.showLeadingBrand,
      showAvatar: widget.showAvatar,
      onTitleSubmitted: widget.onTitleSubmitted,
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

ShellTitleOverrideCubit? lookupShellTitleOverrideCubit(BuildContext context) {
  var hasProvider = false;
  context.visitAncestorElements((element) {
    if (element.widget is BlocProvider<ShellTitleOverrideCubit>) {
      hasProvider = true;
      return false;
    }
    return true;
  });
  if (!hasProvider) {
    return null;
  }

  return BlocProvider.of<ShellTitleOverrideCubit>(context);
}
