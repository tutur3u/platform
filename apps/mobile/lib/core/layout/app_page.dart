import 'package:flutter/widgets.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/layout/page_insets.dart';

/// Non-scrolling page body with the standard gutters, max width and shell
/// dock clearance.
///
/// Use [AppPageBody.fullBleed] only for the canvases listed in the mobile
/// design-system docs (calendar timelines, kanban boards, media/map viewers,
/// chat threads). Full-bleed still honours horizontal safe areas and, unless
/// [consumeBottomClearance] is false, the dock clearance.
class AppPageBody extends StatelessWidget {
  const AppPageBody({
    required this.child,
    this.kind = AppPageKind.detail,
    this.topInset = 0,
    this.consumeBottomClearance = true,
    super.key,
  }) : fullBleed = false;

  const AppPageBody.fullBleed({
    required this.child,
    this.topInset = 0,
    this.consumeBottomClearance = true,
    super.key,
  }) : kind = AppPageKind.root,
       fullBleed = true;

  final Widget child;
  final AppPageKind kind;
  final bool fullBleed;

  /// Extra top space, e.g. the floating shell header height on root pages.
  final double topInset;

  /// When false the bottom MediaQuery padding (dock clearance) is passed
  /// through so an inner scrollable can let content run beneath the dock.
  final bool consumeBottomClearance;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final insets = AppPageInsets.of(
        context,
        width: constraints.maxWidth,
        kind: kind,
        fullBleed: fullBleed,
        topInset: topInset,
        consumeBottomClearance: consumeBottomClearance,
        endGap: AppLayout.boxEndGap,
      );
      return Padding(
        padding: insets,
        child: MediaQuery.removePadding(
          context: context,
          removeLeft: true,
          removeRight: true,
          removeBottom: consumeBottomClearance,
          child: child,
        ),
      );
    },
  );
}

/// A [ListView] whose padding applies the standard page gutters, max-width
/// centring, top gap and dock clearance. The scrollable stays full width.
class AppPageListView extends StatelessWidget {
  const AppPageListView({
    required List<Widget> this.children,
    this.kind = AppPageKind.detail,
    this.topInset = 0,
    this.controller,
    this.physics,
    this.primary,
    this.keyboardDismissBehavior,
    super.key,
  }) : itemCount = null,
       itemBuilder = null;

  const AppPageListView.builder({
    required int this.itemCount,
    required NullableIndexedWidgetBuilder this.itemBuilder,
    this.kind = AppPageKind.detail,
    this.topInset = 0,
    this.controller,
    this.physics,
    this.primary,
    this.keyboardDismissBehavior,
    super.key,
  }) : children = null;

  final List<Widget>? children;
  final int? itemCount;
  final NullableIndexedWidgetBuilder? itemBuilder;
  final AppPageKind kind;
  final double topInset;
  final ScrollController? controller;
  final ScrollPhysics? physics;
  final bool? primary;
  final ScrollViewKeyboardDismissBehavior? keyboardDismissBehavior;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final padding = AppPageInsets.of(
        context,
        width: constraints.maxWidth,
        kind: kind,
        topInset: topInset,
      );
      final dismiss =
          keyboardDismissBehavior ?? ScrollViewKeyboardDismissBehavior.manual;
      final builder = itemBuilder;
      if (builder != null) {
        return ListView.builder(
          controller: controller,
          physics: physics,
          primary: primary,
          keyboardDismissBehavior: dismiss,
          padding: padding,
          itemCount: itemCount,
          itemBuilder: builder,
        );
      }
      return ListView(
        controller: controller,
        physics: physics,
        primary: primary,
        keyboardDismissBehavior: dismiss,
        padding: padding,
        children: children!,
      );
    },
  );
}

/// Pads [sliver] with the standard page insets, resolved from the sliver's
/// cross-axis extent. Set [includeTop]/[includeBottom] to false when the
/// sliver is not the first/last in its scroll view.
class SliverAppPage extends StatelessWidget {
  const SliverAppPage({
    required this.sliver,
    this.kind = AppPageKind.detail,
    this.fullBleed = false,
    this.topInset = 0,
    this.includeTop = true,
    this.includeBottom = true,
    super.key,
  });

  final Widget sliver;
  final AppPageKind kind;
  final bool fullBleed;
  final double topInset;
  final bool includeTop;
  final bool includeBottom;

  @override
  Widget build(BuildContext context) => SliverLayoutBuilder(
    builder: (context, constraints) {
      final insets = AppPageInsets.of(
        context,
        width: constraints.crossAxisExtent,
        kind: kind,
        fullBleed: fullBleed,
        topInset: topInset,
        consumeBottomClearance: includeBottom,
      );
      return SliverPadding(
        padding: includeTop ? insets : insets.copyWith(top: 0),
        sliver: sliver,
      );
    },
  );
}

/// A [CustomScrollView] whose [slivers] share one set of page insets.
///
/// Pinned headers and [SliverFillRemaining] belong in a hand-built
/// [CustomScrollView] with [SliverAppPage] instead.
class AppPageScrollView extends StatelessWidget {
  const AppPageScrollView({
    required this.slivers,
    this.kind = AppPageKind.detail,
    this.topInset = 0,
    this.controller,
    this.physics,
    this.primary,
    this.keyboardDismissBehavior,
    super.key,
  });

  final List<Widget> slivers;
  final AppPageKind kind;
  final double topInset;
  final ScrollController? controller;
  final ScrollPhysics? physics;
  final bool? primary;
  final ScrollViewKeyboardDismissBehavior? keyboardDismissBehavior;

  @override
  Widget build(BuildContext context) => CustomScrollView(
    controller: controller,
    physics: physics,
    primary: primary,
    keyboardDismissBehavior:
        keyboardDismissBehavior ?? ScrollViewKeyboardDismissBehavior.manual,
    slivers: [
      SliverAppPage(
        kind: kind,
        topInset: topInset,
        sliver: SliverMainAxisGroup(slivers: slivers),
      ),
    ],
  );
}
