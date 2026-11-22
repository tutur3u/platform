import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_review_preview.dart';
import 'package:mobile/features/mastermind/fleet/view/preview/fleet_mockup_html.dart';
import 'package:mobile/features/mastermind/fleet/view/preview/fleet_mockup_view.dart';
import 'package:mobile/features/mastermind/fleet/view/preview/fleet_mockup_viewer.dart';
import 'package:mobile/l10n/l10n.dart';

/// A review's mockup inside its detail page. A private HTML document loads
/// with the owner's session and renders natively as a still preview; Open
/// full screen shows it with zoom. Without a document, the preview image
/// (if any) shows and the link opens in the browser. Document bytes live
/// only as long as this widget.
class FleetMockupSection extends StatefulWidget {
  const FleetMockupSection({
    required this.title,
    required this.review,
    this.loadAsset,
    this.launch,
    this.webView = fleetMockupWebView,
    super.key,
  });

  final String title;
  final FleetReview review;
  final FleetReviewAssetLoader? loadAsset;
  final MobileLinkLaunch? launch;
  final FleetMockupWebView webView;

  @override
  State<FleetMockupSection> createState() => _FleetMockupSectionState();
}

class _FleetMockupSectionState extends State<FleetMockupSection> {
  String? _html;
  bool _failed = false;
  int _request = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(FleetMockupSection old) {
    super.didUpdateWidget(old);
    if (old.review.document?.assetId != widget.review.document?.assetId) {
      _load();
    }
  }

  void _load() {
    final document = widget.review.document;
    final loader = widget.loadAsset;
    final request = ++_request;
    _html = null;
    _failed = false;
    if (document == null) return;
    if (loader == null) {
      _failed = true;
      return;
    }
    unawaited(
      loader(document.assetId).then(
        (bytes) {
          if (!mounted || request != _request) return;
          final html = fleetDecodeMockup(bytes);
          setState(() {
            _html = html;
            _failed = html == null;
          });
        },
        onError: (Object _) {
          if (mounted && request == _request) setState(() => _failed = true);
        },
      ),
    );
  }

  void _openLink() => unawaited(
    openMobileLink(context, widget.review.mockupUrl, launch: widget.launch),
  );

  void _openFullScreen() {
    final html = _html;
    if (html == null) return;
    unawaited(
      showFleetMockupViewer(
        context,
        title: widget.title,
        html: html,
        webView: widget.webView,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final review = widget.review;
    final hasDocument = review.document != null;
    final html = _html;
    final Widget frame;
    if (hasDocument) {
      frame = Semantics(
        button: true,
        label: l10n.mastermindFleetMockupLabel,
        child: GestureDetector(
          onTap: html == null ? null : _openFullScreen,
          child: AspectRatio(
            aspectRatio: FleetReviewPreviewImage.aspectRatio,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: colors.muted,
                borderRadius: BorderRadius.circular(tokens.shapes.card),
                border: Border.all(color: colors.border),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(tokens.shapes.card),
                child: ExcludeSemantics(
                  child: html != null
                      ? widget.webView(context, html, interactive: false)
                      : _Placeholder(failed: _failed, onRetry: _load),
                ),
              ),
            ),
          ),
        ),
      );
    } else if (review.preview case final preview?) {
      frame = FleetReviewPreviewImage(
        preview: preview,
        loadAsset: widget.loadAsset,
        onOpen: _openLink,
      );
    } else {
      frame = const SizedBox.shrink();
    }
    // A document that cannot load hands its button to the review's own
    // link, so a failed fetch never hides a mockup that opens elsewhere.
    final opensDocument = hasDocument && !(_failed && !review.linkIsDocument);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(LucideIcons.lock, size: 14, color: colors.mutedForeground),
              const SizedBox(width: AppSpacing.xs),
              Expanded(
                child: Text(
                  l10n.mastermindFleetMockupPrivate.toUpperCase(),
                  style: tokens.typography.overline.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          frame,
          if (opensDocument || !review.linkIsDocument) ...[
            const SizedBox(height: AppSpacing.md),
            AppButton.outline(
              leading: Icon(
                opensDocument
                    ? LucideIcons.maximize2
                    : LucideIcons.externalLink,
                size: 16,
              ),
              enabled: !opensDocument || html != null,
              onPressed: opensDocument ? _openFullScreen : _openLink,
              child: Text(
                opensDocument
                    ? l10n.mastermindFleetMockupOpenFullScreen
                    : l10n.mastermindFleetReviewOpenMockup,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.failed, required this.onRetry});

  final bool failed;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final muted = tokens.colorScheme.mutedForeground;
    if (!failed) return const Center(child: AppLoadingIndicator.inline());
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(LucideIcons.imageOff, color: muted, size: 20),
          const SizedBox(height: AppSpacing.xs),
          Text(
            l10n.mastermindFleetReviewPreviewUnavailable,
            style: tokens.typography.caption.copyWith(color: muted),
          ),
          const SizedBox(height: AppSpacing.xs),
          AppButton.ghost(
            size: AppButtonSize.small,
            onPressed: onRetry,
            child: Text(l10n.mastermindFleetRetry),
          ),
        ],
      ),
    );
  }
}
