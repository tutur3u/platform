import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/view/preview/fleet_mockup_view.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens [html] full screen above the shell, with its own top bar (Close
/// and Reload) and pinch-zoom.
Future<void> showFleetMockupViewer(
  BuildContext context, {
  required String title,
  required String html,
  FleetMockupWebView webView = fleetMockupWebView,
}) => Navigator.of(context, rootNavigator: true).push(
  MaterialPageRoute<void>(
    fullscreenDialog: true,
    builder: (_) =>
        FleetMockupViewer(title: title, html: html, webView: webView),
  ),
);

/// A full-screen, owner-only mockup: a system-owned flow above the shell,
/// so it keeps its own top bar and Close.
class FleetMockupViewer extends StatefulWidget {
  const FleetMockupViewer({
    required this.title,
    required this.html,
    this.webView = fleetMockupWebView,
    super.key,
  });

  final String title;
  final String html;
  final FleetMockupWebView webView;

  @override
  State<FleetMockupViewer> createState() => _FleetMockupViewerState();
}

class _FleetMockupViewerState extends State<FleetMockupViewer> {
  int _generation = 0;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    return Material(
      color: colors.background,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: 56,
              child: Row(
                children: [
                  const SizedBox(width: AppSpacing.xs),
                  AppIconButton(
                    icon: const Icon(LucideIcons.x),
                    tooltip: l10n.mastermindFleetMockupClose,
                    onPressed: () => Navigator.of(context).maybePop(),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Expanded(
                    child: Text(
                      widget.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.heading,
                    ),
                  ),
                  AppIconButton(
                    icon: const Icon(LucideIcons.refreshCw),
                    tooltip: l10n.mastermindFleetMockupReload,
                    onPressed: () => setState(() => _generation++),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(tokens.shapes.card),
                  child: KeyedSubtree(
                    key: ValueKey(_generation),
                    child: widget.webView(
                      context,
                      widget.html,
                      interactive: true,
                    ),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.md,
                AppSpacing.lg,
                AppSpacing.md,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    LucideIcons.lock,
                    size: 16,
                    color: colors.mutedForeground,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      l10n.mastermindFleetMockupFooter,
                      style: tokens.typography.caption.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
