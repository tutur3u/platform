import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TimeTrackerAddEntryFab extends StatefulWidget {
  const TimeTrackerAddEntryFab({
    required this.onPressed,
    this.enabled = true,
    super.key,
  });

  final Future<void> Function() onPressed;
  final bool enabled;

  @override
  State<TimeTrackerAddEntryFab> createState() => _TimeTrackerAddEntryFabState();
}

class _TimeTrackerAddEntryFabState extends State<TimeTrackerAddEntryFab> {
  var _isLoading = false;

  Future<void> _handlePressed() async {
    if (_isLoading || !widget.enabled) {
      return;
    }

    setState(() => _isLoading = true);
    try {
      await widget.onPressed();
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ExtendedFab(
      icon: shad.LucideIcons.plus,
      label: context.l10n.timerAddMissedEntry,
      enabled: widget.enabled,
      loading: _isLoading,
      includeBottomSafeArea: false,
      onPressed: _handlePressed,
    );
  }
}
