import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/layout/layout_tokens.dart';

/// Split policy for list/detail screens. Decisions use the body width the
/// screen receives (after the shell rail), never the window.
abstract final class AppMasterDetailLayout {
  /// Smallest body width that shows list and detail side by side. A tablet
  /// in portrait (about 768-834dp) fits a 320dp list beside a readable pane.
  static const double splitMinWidth = 720;

  static const double listMinWidth = 320;
  static const double listMaxWidth = 400;

  static bool isSplit(double width) => width.isFinite && width >= splitMinWidth;

  /// List pane width: about a third of the body, clamped to 320-400dp.
  static double listWidth(double width) =>
      math.min(listMaxWidth, math.max(listMinWidth, width * 0.34));
}

/// Adaptive list/detail layout.
///
/// At [AppMasterDetailLayout.splitMinWidth] or wider the [master] and the
/// detail pane sit side by side, and the pane shows [detail] or, without a
/// selection, [emptyDetail]. Narrower bodies show only [master]; the feature
/// keeps presenting the selection with its usual pushed route.
///
/// The feature owns the selection, so it survives rotation and resizing.
/// [onSplitChanged] reports the mode after every change (and after the first
/// layout) so the feature can move an open selection between its pushed
/// route and the pane. [master] keeps its state across mode changes.
class AppMasterDetail extends StatefulWidget {
  const AppMasterDetail({
    required this.master,
    required this.emptyDetail,
    this.detail,
    this.detailKey,
    this.onSplitChanged,
    this.onCloseDetail,
    super.key,
  });

  final Widget master;
  final Widget? detail;
  final Widget emptyDetail;

  /// Identity of the selection. A new key moves keyboard focus into the pane.
  final Object? detailKey;

  final ValueChanged<bool>? onSplitChanged;

  /// Escape inside the detail pane calls this to clear the selection.
  final VoidCallback? onCloseDetail;

  /// Whether the nearest [AppMasterDetail] currently shows both panes.
  static bool isSplitOf(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<_AppMasterDetailScope>()
          ?.split ??
      false;

  /// Whether [context] is inside a split layout's detail pane.
  static bool inDetailPaneOf(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<_AppMasterDetailScope>()
          ?.detailPane ??
      false;

  @override
  State<AppMasterDetail> createState() => _AppMasterDetailState();
}

class _AppMasterDetailState extends State<AppMasterDetail> {
  final GlobalKey _masterKey = GlobalKey(debugLabel: 'master-detail.master');
  final FocusScopeNode _detailFocus = FocusScopeNode(
    debugLabel: 'master-detail.detail',
  );
  bool? _reportedSplit;

  @override
  void didUpdateWidget(covariant AppMasterDetail oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.detailKey != null && widget.detailKey != oldWidget.detailKey) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _reportedSplit == true) _detailFocus.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _detailFocus.dispose();
    super.dispose();
  }

  void _report(bool split) {
    if (_reportedSplit == split) return;
    _reportedSplit = split;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _reportedSplit == split) {
        widget.onSplitChanged?.call(split);
      }
    });
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final split = AppMasterDetailLayout.isSplit(constraints.maxWidth);
      _report(split);
      final master = KeyedSubtree(key: _masterKey, child: widget.master);
      if (!split) {
        return _AppMasterDetailScope(
          split: false,
          detailPane: false,
          child: master,
        );
      }
      final listWidth = AppMasterDetailLayout.listWidth(constraints.maxWidth);
      return _AppMasterDetailScope(
        split: true,
        detailPane: false,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: listWidth,
              child: FocusTraversalGroup(child: master),
            ),
            VerticalDivider(
              width: 1,
              thickness: 1,
              color: Theme.of(context).dividerColor,
            ),
            Expanded(
              child: _AppMasterDetailScope(
                split: true,
                detailPane: true,
                child: CallbackShortcuts(
                  bindings: {
                    if (widget.detail != null && widget.onCloseDetail != null)
                      const SingleActivator(LogicalKeyboardKey.escape):
                          widget.onCloseDetail!,
                  },
                  child: FocusScope(
                    node: _detailFocus,
                    child: FocusTraversalGroup(
                      child: widget.detail ?? widget.emptyDetail,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    },
  );
}

/// Wraps the detail route a compact layout pushes.
///
/// A covered route is not laid out, so [AppMasterDetail] cannot see a
/// rotation while its pushed detail is on top. This wrapper watches the
/// width the route receives and calls [onSplit] once it is wide enough, so
/// the owner can fold the route back into the detail pane.
class AppMasterDetailRouteBody extends StatefulWidget {
  const AppMasterDetailRouteBody({
    required this.onSplit,
    required this.child,
    super.key,
  });

  final VoidCallback onSplit;
  final Widget child;

  @override
  State<AppMasterDetailRouteBody> createState() =>
      _AppMasterDetailRouteBodyState();
}

class _AppMasterDetailRouteBodyState extends State<AppMasterDetailRouteBody> {
  bool _reported = false;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final split = AppMasterDetailLayout.isSplit(constraints.maxWidth);
      if (split && !_reported) {
        _reported = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) widget.onSplit();
        });
      } else if (!split) {
        _reported = false;
      }
      return widget.child;
    },
  );
}

class _AppMasterDetailScope extends InheritedWidget {
  const _AppMasterDetailScope({
    required this.split,
    required this.detailPane,
    required super.child,
  });

  final bool split;
  final bool detailPane;

  @override
  bool updateShouldNotify(_AppMasterDetailScope oldWidget) =>
      split != oldWidget.split || detailPane != oldWidget.detailPane;
}

/// Centred placeholder for a detail pane without a selection.
class AppMasterDetailEmpty extends StatelessWidget {
  const AppMasterDetailEmpty({
    required this.icon,
    required this.title,
    this.message,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: colors.onSurfaceVariant),
            const SizedBox(height: AppSpacing.md),
            Text(
              title,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium,
            ),
            if (message case final message?) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                message,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: colors.onSurfaceVariant,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
