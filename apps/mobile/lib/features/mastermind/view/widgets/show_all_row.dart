import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/l10n/l10n.dart';

/// The last row of a capped list: "Show all N", opening the owning tab.
///
/// Render it only when the list holds more than its cap, so a short list
/// never ends in a link that shows nothing new.
class MastermindShowAllRow extends StatelessWidget {
  const MastermindShowAllRow({
    required this.count,
    required this.onTap,
    super.key,
  });

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => AppGroupedRow(
    title: Text(context.l10n.mastermindShowAll(count)),
    showChevron: true,
    onTap: onTap,
  );
}
