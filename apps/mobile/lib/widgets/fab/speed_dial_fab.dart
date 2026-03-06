import 'package:flutter/material.dart';
import 'package:mobile/widgets/fab/fab_action.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

const double _mainFabSize = 56;
const double _actionFabSize = 44;
const double _actionSpacing = 10;

/// Speed Dial FAB that expands into multiple actions when tapped.
///
/// Fixed bottom-right. Tap to expand; tap an action to run and auto-close.
/// Uses smooth scale/fade animations for open/close.
class SpeedDialFab extends StatefulWidget {
  const SpeedDialFab({
    required this.label,
    required this.icon,
    required this.actions,
    this.bottom = 16,
    this.right = 16,
    super.key,
  });

  final String label;
  final IconData icon;
  final List<FabAction> actions;
  final double bottom;
  final double right;

  @override
  State<SpeedDialFab> createState() => _SpeedDialFabState();
}

class _SpeedDialFabState extends State<SpeedDialFab> {
  bool _expanded = false;
  static const Duration _animationDuration = Duration(milliseconds: 200);

  void _toggle() {
    setState(() => _expanded = !_expanded);
  }

  void _onActionTap(FabAction action) {
    action.onPressed();
    if (!mounted) return;
    setState(() => _expanded = false);
  }

  @override
  Widget build(BuildContext context) {
    final safeAreaPadding = MediaQuery.paddingOf(context);
    final adjustedRight = widget.right + safeAreaPadding.right;
    final adjustedBottom = widget.bottom + safeAreaPadding.bottom;

    return Positioned(
      right: adjustedRight,
      bottom: adjustedBottom,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          AnimatedCrossFade(
            firstChild: const SizedBox.shrink(),
            secondChild: _buildActionsColumn(context),
            crossFadeState: _expanded
                ? CrossFadeState.showSecond
                : CrossFadeState.showFirst,
            duration: _animationDuration,
            sizeCurve: Curves.easeOutCubic,
          ),
          if (_expanded) const SizedBox(height: _actionSpacing + 2),
          _buildMainFab(context),
        ],
      ),
    );
  }

  Widget _buildActionsColumn(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (var i = widget.actions.length - 1; i >= 0; i--) ...[
          if (i < widget.actions.length - 1)
            const SizedBox(height: _actionSpacing),
          _ActionItem(
            action: widget.actions[i],
            onTap: () => _onActionTap(widget.actions[i]),
          ),
        ],
      ],
    );
  }

  Widget _buildMainFab(BuildContext context) {
    return Semantics(
      label: widget.label,
      button: true,
      child: SizedBox(
        width: _mainFabSize,
        height: _mainFabSize,
        child: shad.PrimaryButton(
          onPressed: _toggle,
          shape: shad.ButtonShape.circle,
          density: shad.ButtonDensity.icon,
          child: Center(
            child: AnimatedRotation(
              turns: _expanded ? 0.125 : 0,
              duration: _animationDuration,
              curve: Curves.easeOutCubic,
              child: Icon(widget.icon, size: 24),
            ),
          ),
        ),
      ),
    );
  }
}

class _ActionItem extends StatelessWidget {
  const _ActionItem({
    required this.action,
    required this.onTap,
  });

  final FabAction action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: colorScheme.card,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: colorScheme.border),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.08),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Text(
            action.label,
            style: theme.typography.small.copyWith(
              fontWeight: FontWeight.w500,
              color: colorScheme.foreground,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Tooltip(
          message: action.label,
          child: Semantics(
            label: action.label,
            button: true,
            child: SizedBox(
              width: _actionFabSize,
              height: _actionFabSize,
              child: shad.PrimaryButton(
                onPressed: onTap,
                shape: shad.ButtonShape.circle,
                density: shad.ButtonDensity.icon,
                child: Center(child: Icon(action.icon, size: 20)),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
