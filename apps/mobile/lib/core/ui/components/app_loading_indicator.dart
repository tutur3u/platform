import 'package:flutter/material.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// How much space a loading state owns.
enum AppLoadingSize {
  /// Inside a button, row trailing slot or chip.
  inline(20),

  /// A card, panel, list footer or other part of a page.
  section(32),

  /// The whole page, pane or full-screen gate.
  page(56);

  const AppLoadingSize(this.dimension);

  /// Diameter of the indicator in logical pixels.
  final double dimension;
}

/// The one loading indicator: the brand Nova mark at a size that matches the
/// space it stands in for, centred and announced to screen readers.
///
/// Use [AppLoadingIndicator.page] when nothing else is on screen yet; it fills
/// the available space and centres a full-size mark, so a full-screen loader
/// never shows a tiny spinner. Lists should prefer skeleton rows
/// (`AppSkeletonRows`) for a cold first load.
class AppLoadingIndicator extends StatelessWidget {
  const AppLoadingIndicator({
    this.size = AppLoadingSize.section,
    this.semanticLabel,
    super.key,
  });

  /// Centres a page-size indicator in the space its parent gives it.
  const AppLoadingIndicator.page({this.semanticLabel, super.key})
    : size = AppLoadingSize.page;

  /// A compact indicator for buttons and row trailing slots.
  const AppLoadingIndicator.inline({this.semanticLabel, super.key})
    : size = AppLoadingSize.inline;

  final AppLoadingSize size;

  /// Defaults to the localized "Loading".
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final label =
        semanticLabel ??
        Localizations.of<AppLocalizations>(
          context,
          AppLocalizations,
        )?.commonLoading;
    final indicator = Semantics(
      label: label,
      liveRegion: size != AppLoadingSize.inline,
      child: NovaLoadingIndicator(
        key: ValueKey('app-loading-${size.name}'),
        size: size.dimension,
      ),
    );
    // Like Center: fills a bounded parent, hugs the mark in a scroll view.
    return size == AppLoadingSize.page ? Center(child: indicator) : indicator;
  }
}
