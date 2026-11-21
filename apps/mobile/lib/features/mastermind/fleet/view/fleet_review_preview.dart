import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_review_fetch.dart';
import 'package:mobile/l10n/l10n.dart';

/// Reads an uploaded preview's bytes with the owner's session.
typedef FleetReviewAssetLoader = Future<Uint8List> Function(String assetId);

/// Reads a first-party hosted preview's bytes, without credentials.
typedef FleetHostedImageLoader = Future<Uint8List> Function(Uri url);

/// A review's mockup preview at a fixed 16:10 frame with rounded corners.
/// Tapping it opens the full mockup. A hosted image loads through
/// [loadHosted] (no redirects, no credentials, size-capped); an uploaded
/// asset loads through [loadAsset], never from a URL in the snapshot. Both
/// must carry a PNG, JPEG or WebP signature. Bytes live only as long as
/// this widget, so nothing outlives the signed-in session. Anything that
/// fails to load shows a quiet placeholder; the review stays answerable.
class FleetReviewPreviewImage extends StatefulWidget {
  const FleetReviewPreviewImage({
    required this.preview,
    required this.onOpen,
    this.loadAsset,
    this.loadHosted = fleetFetchHostedReviewImage,
    super.key,
  });

  final FleetReviewPreview preview;
  final VoidCallback onOpen;
  final FleetReviewAssetLoader? loadAsset;
  final FleetHostedImageLoader loadHosted;

  static const double aspectRatio = 16 / 10;

  @override
  State<FleetReviewPreviewImage> createState() => _PreviewState();
}

class _PreviewState extends State<FleetReviewPreviewImage> {
  Uint8List? _bytes;
  bool _failed = false;
  int _request = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(FleetReviewPreviewImage old) {
    super.didUpdateWidget(old);
    final before = old.preview;
    final after = widget.preview;
    if (before is FleetAssetPreview &&
        after is FleetAssetPreview &&
        before.assetId == after.assetId) {
      return;
    }
    if (before is FleetHostedPreview &&
        after is FleetHostedPreview &&
        before.url == after.url) {
      return;
    }
    _load();
  }

  void _load() {
    final request = ++_request;
    _bytes = null;
    _failed = false;
    final assets = widget.loadAsset;
    final Future<Uint8List> pending;
    switch (widget.preview) {
      case FleetHostedPreview(:final url):
        pending = widget.loadHosted(url);
      case FleetAssetPreview(:final assetId) when assets != null:
        pending = assets(assetId);
      case FleetAssetPreview():
        _failed = true;
        return;
    }
    unawaited(
      pending.then(
        (bytes) {
          if (!mounted || request != _request) return;
          setState(() {
            if (fleetSniffReviewImage(bytes) == null) {
              _failed = true;
            } else {
              _bytes = bytes;
            }
          });
        },
        onError: (Object _) {
          if (mounted && request == _request) setState(() => _failed = true);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    Widget fallback(BuildContext context, Object _, StackTrace? _) =>
        const _Placeholder(failed: true);
    final bytes = _bytes;
    final image = bytes != null
        ? Image.memory(bytes, fit: BoxFit.cover, errorBuilder: fallback)
        : _Placeholder(failed: _failed);
    return Semantics(
      button: true,
      image: true,
      label: context.l10n.mastermindFleetReviewPreview,
      child: GestureDetector(
        onTap: widget.onOpen,
        child: AspectRatio(
          aspectRatio: FleetReviewPreviewImage.aspectRatio,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: tokens.colorScheme.muted,
              borderRadius: BorderRadius.circular(tokens.shapes.card),
              border: Border.all(color: tokens.colorScheme.border),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(tokens.shapes.card),
              child: ExcludeSemantics(child: image),
            ),
          ),
        ),
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.failed});

  final bool failed;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final muted = tokens.colorScheme.mutedForeground;
    return Center(
      child: failed
          ? Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(LucideIcons.imageOff, color: muted, size: 20),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  context.l10n.mastermindFleetReviewPreviewUnavailable,
                  style: tokens.typography.small.copyWith(color: muted),
                ),
              ],
            )
          : const AppLoadingIndicator.inline(),
    );
  }
}
