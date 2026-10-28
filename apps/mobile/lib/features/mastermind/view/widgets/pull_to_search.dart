import 'package:flutter/widgets.dart';
import 'package:mobile/features/mastermind/view/widgets/collapsible_search.dart';

/// Navbar search leaves refresh gestures separate.
class MastermindPullToSearch extends StatelessWidget {
  const MastermindPullToSearch({
    required this.controller,
    required this.child,
    super.key,
  });
  final MastermindSearchController controller;
  final Widget child;
  @override
  Widget build(BuildContext context) => child;
}
