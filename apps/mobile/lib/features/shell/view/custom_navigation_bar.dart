import 'package:flutter/material.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Custom navigation bar with pill-shaped selection indicators.
/// Matches outer container border radius for first/last items.
class CustomNavigationBar extends StatelessWidget {
  const CustomNavigationBar({
    required this.children,
    super.key,
    this.selectedKey,
    this.onSelected,
  });

  final List<Widget> children;
  final Key? selectedKey;
  final ValueChanged<Key?>? onSelected;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: Row(
        children: List.generate(children.length, (index) {
          final child = children[index];
          final isFirst = index == 0;
          final isLast = index == children.length - 1;

          Key? itemKey;
          if (child is shad.NavigationItem) {
            itemKey = child.key;
          }

          final isSelected = itemKey == selectedKey;

          return Expanded(
            child: Padding(
              padding: EdgeInsets.only(
                left: isFirst ? 0 : 2,
                right: isLast ? 0 : 2,
              ),
              child: _CustomNavItem(
                isFirst: isFirst,
                isLast: isLast,
                isSelected: isSelected,
                theme: theme,
                isDark: isDark,
                onTap: () => onSelected?.call(itemKey),
                child: child,
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _CustomNavItem extends StatelessWidget {
  const _CustomNavItem({
    required this.child,
    required this.isFirst,
    required this.isLast,
    required this.isSelected,
    required this.theme,
    required this.isDark,
    this.onTap,
  });

  final Widget child;
  final bool isFirst;
  final bool isLast;
  final bool isSelected;
  final shad.ThemeData theme;
  final bool isDark;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    var content = child;
    if (child is shad.NavigationItem) {
      final navItem = child as shad.NavigationItem;
      content = navItem.child;
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: _getBorderRadius(context),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOutCubic,
          padding: EdgeInsetsDirectional.fromSTEB(
            isFirst ? 6 : 12,
            10,
            isLast ? 6 : 12,
            10,
          ),
          decoration: BoxDecoration(
            color: isSelected
                ? (isDark
                      ? Colors.white.withValues(alpha: 0.12)
                      : Colors.black.withValues(alpha: 0.08))
                : Colors.transparent,
            borderRadius: _getBorderRadius(context),
          ),
          child: Center(child: content),
        ),
      ),
    );
  }

  BorderRadius _getBorderRadius(BuildContext context) {
    final isRtl = Directionality.of(context) == TextDirection.rtl;
    if (isFirst && isLast) {
      return BorderRadius.circular(20);
    } else if (isFirst) {
      return isRtl
          ? const BorderRadius.horizontal(
              left: Radius.circular(4),
              right: Radius.circular(20),
            )
          : const BorderRadius.horizontal(
              left: Radius.circular(20),
              right: Radius.circular(4),
            );
    } else if (isLast) {
      return isRtl
          ? const BorderRadius.horizontal(
              left: Radius.circular(20),
              right: Radius.circular(4),
            )
          : const BorderRadius.horizontal(
              left: Radius.circular(4),
              right: Radius.circular(20),
            );
    } else {
      return BorderRadius.circular(4);
    }
  }
}
