import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/utils/color_hex.dart';
import 'package:mobile/l10n/l10n.dart';

/// One or two initials from a display name, or from an address's local
/// part when there is no name.
String mailParticipantInitials(String? name, String address) {
  final source = name?.trim().isNotEmpty == true
      ? name!.trim()
      : address.split('@').first;
  final parts = (source.isEmpty ? '?' : source)
      .split(RegExp(r'[\s._-]+'))
      .where((part) => part.isNotEmpty)
      .toList();
  if (parts.isEmpty) return '?';
  String first(String part) => String.fromCharCode(part.runes.first);
  return [
    first(parts.first),
    if (parts.length > 1) first(parts.last),
  ].join().toUpperCase();
}

/// The labels a row shows: a folder's own system label is redundant there.
List<Map<String, dynamic>> visibleMailLabels(
  List<Map<String, dynamic>> labels,
  String? folder,
) => labels
    .where((label) => label['kind'] != 'system' || label['slug'] != folder)
    .toList();

/// The 24px initials avatar at the start of a list row.
class MailParticipantAvatar extends StatelessWidget {
  const MailParticipantAvatar({
    required this.address,
    this.name,
    this.size = 24,
    super.key,
  });

  final String address;
  final String? name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    return ExcludeSemantics(
      child: SizedBox.square(
        dimension: size,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colors.muted,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              mailParticipantInitials(name, address),
              maxLines: 1,
              textScaler: TextScaler.noScaling,
              style: tokens.typography.ui.copyWith(
                fontSize: 10,
                height: 1,
                fontWeight: FontWeight.w500,
                color: colors.foreground,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A small filled dot: unread markers and label colours.
class MailDot extends StatelessWidget {
  const MailDot({required this.color, this.size = 8, super.key});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: size,
    child: DecoratedBox(
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    ),
  );
}

/// A label's own colour, or a quiet foreground tint when it has none.
Color mailLabelColor(BuildContext context, Map<String, dynamic> label) =>
    parseHex(label['color'] as String?) ??
    AppTokens.of(context).colorScheme.foreground.withValues(alpha: 0.3);

/// Up to two label badges with their colour dot; more collapse into one
/// "N tags" badge whose tooltip lists every name.
class MailLabelBadges extends StatelessWidget {
  const MailLabelBadges({required this.labels, super.key});

  final List<Map<String, dynamic>> labels;

  @override
  Widget build(BuildContext context) {
    final named = [
      for (final label in labels)
        if (label['name'] case final String name when name.isNotEmpty)
          (label, name),
    ];
    if (named.isEmpty) return const SizedBox.shrink();
    if (named.length > 2) {
      return AppTooltip(
        message: named.map((entry) => entry.$2).join(', '),
        child: AppBadge(
          key: const ValueKey('mail-label-count'),
          child: Text(context.l10n.mailTagCount(named.length)),
        ),
      );
    }
    return Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      children: [
        for (final (label, name) in named)
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 160),
            child: AppBadge(
              leading: MailDot(color: mailLabelColor(context, label), size: 6),
              child: Text(name),
            ),
          ),
      ],
    );
  }
}
