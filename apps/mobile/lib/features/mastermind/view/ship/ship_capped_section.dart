import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/l10n/l10n.dart';

// TODO(vhpx): Switch to the shared MastermindCappedGroup from view/widgets/
// once the Mastermind UX foundation PR lands, and delete this one.

/// A grouped section that shows its first [cap] rows and a "Show all N" row
/// for the rest, with the row count beside the caption. Expanding is local
/// to this widget, so it survives a scroll but not a rebuild of the page.
class ShipCappedSection extends StatefulWidget {
  const ShipCappedSection({
    required this.caption,
    required this.rows,
    this.empty,
    this.footer,
    this.cap = 5,
    super.key,
  });

  final String caption;
  final List<Widget> rows;

  /// Shown alone when [rows] is empty; with no [empty] the section is left
  /// out.
  final Widget? empty;
  final String? footer;
  final int cap;

  @override
  State<ShipCappedSection> createState() => _ShipCappedSectionState();
}

class _ShipCappedSectionState extends State<ShipCappedSection> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final rows = widget.rows;
    final empty = widget.empty;
    if (rows.isEmpty && empty == null) return const SizedBox.shrink();
    final capped = rows.length > widget.cap;
    final shown = capped && !_expanded ? rows.take(widget.cap) : rows;
    return AppGroupedSection.spaced(
      caption: widget.caption,
      captionTrailing: rows.isEmpty
          ? null
          : Text(
              '${rows.length}',
              style: const TextStyle(
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
      footer: widget.footer,
      children: [
        if (rows.isEmpty) empty!,
        ...shown,
        if (capped)
          Semantics(
            expanded: _expanded,
            child: AppGroupedRow(
              title: Text(
                _expanded
                    ? l10n.mastermindListShowFewer
                    : l10n.mastermindListShowAll(rows.length),
              ),
              trailing: Icon(
                _expanded ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                size: 18,
              ),
              onTap: () => setState(() => _expanded = !_expanded),
            ),
          ),
      ],
    );
  }
}
