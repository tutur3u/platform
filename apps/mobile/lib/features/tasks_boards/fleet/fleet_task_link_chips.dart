import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/components/app_toast.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_meta.dart';
import 'package:mobile/l10n/l10n.dart';

/// Every fleet link as a tappable chip: URLs open in the browser, bare
/// references such as a commit SHA are copied.
class FleetTaskLinkChips extends StatelessWidget {
  const FleetTaskLinkChips({required this.links, super.key});

  final List<FleetTaskLink> links;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [for (final link in links) _FleetLinkChip(link: link)],
    );
  }
}

class _FleetLinkChip extends StatelessWidget {
  const _FleetLinkChip({required this.link});

  final FleetTaskLink link;

  Future<void> _open(BuildContext context) async {
    final uri = link.uri;
    if (uri != null) {
      await openMobileLink(context, uri);
      return;
    }
    await Clipboard.setData(ClipboardData(text: link.value));
    if (context.mounted) {
      showAppToast(context, message: context.l10n.fleetLinkCopied);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final (icon, kindLabel) = switch (link.kind) {
      'pr' => (Icons.call_merge_rounded, l10n.fleetLinkPr),
      'commit' => (Icons.commit_rounded, l10n.fleetLinkCommit),
      'thread' => (Icons.forum_outlined, l10n.fleetLinkThread),
      _ => (Icons.link_rounded, link.kind),
    };
    final label = link.kind == 'pr' && link.shortValue.startsWith('#')
        ? '$kindLabel ${link.shortValue}'
        : link.shortValue;

    return Semantics(
      button: true,
      label: '$kindLabel ${link.shortValue}',
      child: Material(
        color: colors.muted,
        shape: StadiumBorder(side: BorderSide(color: colors.border)),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: () => _open(context),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 40, maxWidth: 260),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 15, color: colors.mutedForeground),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: colors.foreground,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
