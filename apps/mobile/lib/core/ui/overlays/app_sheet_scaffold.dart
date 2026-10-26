import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_modal_scope.dart';
import 'package:mobile/core/ui/overlays/app_sheet_search.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Below this height (scaled with text) the chrome scrolls with the body.
const double _tightHeight = 280;

/// Content layout for `showAppSheet` and `showAppDialog` bodies.
///
/// Owns the title row, an optional dynamic [search], one lazy scroll body and
/// a footer for [actions]. The body ends above the floating dock and the
/// keyboard, whichever is taller, so the last row is never covered.
class AppSheetScaffold extends StatelessWidget {
  const AppSheetScaffold({
    required this.title,
    this.description,
    this.icon,
    this.child,
    this.slivers,
    this.actions = const [],
    this.search,
    this.showCloseButton = true,
    this.padding = const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
    super.key,
  }) : assert(
         (child == null) != (slivers == null),
         'Supply exactly one of child or slivers.',
       );

  final String title;
  final String? description;
  final IconData? icon;
  final Widget? child;

  /// Lazy body; prefer this for long lists.
  final List<Widget>? slivers;
  final List<Widget> actions;

  /// Registers a dynamic shell search action instead of an inline field.
  final AppSheetSearch? search;
  final bool showCloseButton;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final scope = AppModalScope.maybeOf(context);
    final media = MediaQuery.of(context);
    final bottomClearance =
        math.max(media.viewInsets.bottom, media.padding.bottom) + AppSpacing.lg;
    final header = Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.sm,
        AppSpacing.md,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: c.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
              child: Icon(icon, color: c.primary, size: 20),
            ),
            const SizedBox(width: AppSpacing.md),
          ],
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                    header: true,
                    child: Text(
                      title,
                      style: tokens.typography.h4.copyWith(
                        color: c.foreground,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (description case final description?) ...[
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      description,
                      style: tokens.typography.small.copyWith(
                        color: c.mutedForeground,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (showCloseButton && scope != null)
            AppIconButton(
              key: const ValueKey('app-sheet-close'),
              tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
              icon: const Icon(AppIcons.close),
              onPressed: scope.close,
            ),
        ],
      ),
    );
    final searchHost = switch (search) {
      final search? => AppSheetSearchHost(search: search),
      null => null,
    };
    final footer = actions.isEmpty
        ? null
        : DecoratedBox(
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: c.border)),
            ),
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.md,
                AppSpacing.lg,
                bottomClearance,
              ),
              child: Wrap(
                alignment: WrapAlignment.end,
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: actions,
              ),
            ),
          );
    final expands = scope?.expands ?? false;
    // When the keyboard or large text leaves little room, the header, search
    // and actions scroll with the body instead of overflowing.
    Widget body({required bool tight}) => CustomScrollView(
      controller: scope?.scrollController,
      shrinkWrap: !expands,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      slivers: [
        if (tight) SliverToBoxAdapter(child: header),
        if (tight && searchHost != null) SliverToBoxAdapter(child: searchHost),
        SliverPadding(
          padding: padding,
          sliver: SliverMainAxisGroup(
            slivers: slivers ?? [SliverToBoxAdapter(child: child)],
          ),
        ),
        if (tight && footer != null) SliverToBoxAdapter(child: footer),
        SliverToBoxAdapter(
          child: SizedBox(height: footer == null ? bottomClearance : 0),
        ),
      ],
    );
    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: title,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final tight =
              constraints.maxHeight <
              _tightHeight * MediaQuery.textScalerOf(context).scale(1);
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (!tight) header,
              if (!tight && searchHost != null) searchHost,
              Flexible(
                fit: expands ? FlexFit.tight : FlexFit.loose,
                child: NotificationListener<ScrollNotification>(
                  // Keep sheet scrolling from driving the page's dock reveal.
                  onNotification: (_) => true,
                  child: body(tight: tight),
                ),
              ),
              if (!tight && footer != null) footer,
            ],
          );
        },
      ),
    );
  }
}
