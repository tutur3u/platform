import 'package:flutter/material.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Keeps Material's drag threshold, accessibility, and refresh lifecycle while
/// presenting the same Nova mark used by page and inline loading states.
class NovaRefreshIndicator extends StatefulWidget {
  const NovaRefreshIndicator({
    required this.child,
    required this.onRefresh,
    this.notificationPredicate = defaultScrollNotificationPredicate,
    super.key,
  });

  final Widget child;
  final RefreshCallback onRefresh;
  final ScrollNotificationPredicate notificationPredicate;

  @override
  State<NovaRefreshIndicator> createState() => _NovaRefreshIndicatorState();
}

class _NovaRefreshIndicatorState extends State<NovaRefreshIndicator> {
  RefreshIndicatorStatus? _status;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      RefreshIndicator.noSpinner(
        onRefresh: widget.onRefresh,
        notificationPredicate: widget.notificationPredicate,
        onStatusChange: (status) {
          if (mounted) setState(() => _status = status);
        },
        child: widget.child,
      ),
      if (_status != null &&
          _status != RefreshIndicatorStatus.done &&
          _status != RefreshIndicatorStatus.canceled)
        Positioned(
          top: 12,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: Center(
              child: Semantics(
                label: MaterialLocalizations.of(
                  context,
                ).refreshIndicatorSemanticLabel,
                liveRegion: _status == RefreshIndicatorStatus.refresh,
                child: const SizedBox.square(
                  dimension: 36,
                  child: NovaLoadingIndicator(size: 32),
                ),
              ),
            ),
          ),
        ),
    ],
  );
}
