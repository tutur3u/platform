import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Page frame. Replaces `shad.Scaffold`.
///
/// Inside the shell a page passes only [child]: the shell owns the top navbar,
/// Back and the ambient background, so the scaffold stays transparent and
/// adds no bars. [headers] are for explicit full-screen flows opened above
/// the shell (use [AppTopBar]); never stack a header inside a shell body.
class AppScaffold extends StatelessWidget {
  const AppScaffold({
    required this.child,
    this.headers = const [],
    this.footers = const [],
    this.backgroundColor,
    super.key,
  });

  final Widget child;
  final List<Widget> headers;
  final List<Widget> footers;

  /// Defaults to transparent so the shell's appearance background shows.
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    return Material(
      color: backgroundColor ?? Colors.transparent,
      child: DefaultTextStyle.merge(
        style: TextStyle(color: c.foreground),
        child: Column(
          children: [
            ...headers,
            Expanded(child: child),
            ...footers,
          ],
        ),
      ),
    );
  }
}

/// Top bar for full-screen flows above the shell. Replaces `shad.AppBar`
/// outside the shell chrome. Inside the shell, register title and actions with
/// the shell instead.
class AppTopBar extends StatelessWidget {
  const AppTopBar({
    required this.title,
    this.leading,
    this.trailing = const [],
    this.subtitle,
    super.key,
  });

  final Widget title;
  final Widget? subtitle;
  final Widget? leading;
  final List<Widget> trailing;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return SafeArea(
      bottom: false,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm,
            vertical: AppSpacing.xs,
          ),
          child: Row(
            children: [
              ?leading,
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      DefaultTextStyle.merge(
                        style: tokens.typography.h4.copyWith(
                          color: c.foreground,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        child: title,
                      ),
                      if (subtitle != null)
                        DefaultTextStyle.merge(
                          style: tokens.typography.xSmall.copyWith(
                            color: c.mutedForeground,
                          ),
                          child: subtitle!,
                        ),
                    ],
                  ),
                ),
              ),
              ...trailing,
            ],
          ),
        ),
      ),
    );
  }
}
