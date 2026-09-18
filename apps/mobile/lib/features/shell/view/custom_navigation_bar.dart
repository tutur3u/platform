import 'package:flutter/material.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Stable tab targets with native-style selection and visible labels.
class CustomNavigationBar extends StatelessWidget {
  const CustomNavigationBar({
    required this.children,
    super.key,
    this.selectedKey,
    this.onSelected,
    this.expandItems = true,
    this.minItemWidth = 0,
    this.compact = false,
  });
  final List<Widget> children;
  final Key? selectedKey;
  final ValueChanged<Key?>? onSelected;
  final bool expandItems;
  final double minItemWidth;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: expandItems ? MainAxisSize.max : MainAxisSize.min,
      children: children.map((child) {
        final itemKey = child.key;
        final selected = itemKey == selectedKey;
        final color = selected ? colors.primary : colors.onSurfaceVariant;
        final item = Semantics(
          key: itemKey,
          selected: selected,
          button: true,
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => onSelected?.call(itemKey),
              borderRadius: BorderRadius.circular(10),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: 48,
                  minWidth: minItemWidth,
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  child: IconTheme(
                    data: IconThemeData(color: color),
                    child: DefaultTextStyle.merge(
                      style: TextStyle(color: color),
                      child: Center(
                        child: child is shad.NavigationItem
                            ? child.child
                            : child,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        return expandItems ? Expanded(child: item) : item;
      }).toList(),
    );
  }
}
