import 'package:flutter/material.dart';

/// Keeps the root mounted when a detail is visible beside the sidebar.
class ShellRootBody extends StatelessWidget {
  const ShellRootBody({
    required this.rootVisible,
    required this.root,
    required this.detail,
    super.key,
  });

  final bool rootVisible;
  final WidgetBuilder? root;
  final WidgetBuilder detail;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      Offstage(
        offstage: !rootVisible,
        child: TickerMode(
          enabled: rootVisible,
          child: root == null
              ? const SizedBox.shrink()
              : Builder(
                  builder: (context) {
                    final media = MediaQuery.of(context);
                    return MediaQuery(
                      // The header owns the top inset. Root pages still need
                      // the physical status-bar inset for scroll clearance.
                      data: media
                          .removePadding(removeTop: true)
                          .copyWith(viewPadding: media.viewPadding),
                      child: root!(context),
                    );
                  },
                ),
        ),
      ),
      if (!rootVisible) detail(context),
    ],
  );
}

class ShellRoutedBody extends StatelessWidget {
  const ShellRoutedBody({
    required this.background,
    required this.child,
    super.key,
  });

  final Color Function(BuildContext) background;
  final Widget child;

  @override
  Widget build(BuildContext context) => MediaQuery.removePadding(
    context: context,
    removeTop: true,
    child: Theme(
      data: Theme.of(context).copyWith(
        scaffoldBackgroundColor: background(context),
      ),
      child: SizedBox.expand(child: child),
    ),
  );
}
