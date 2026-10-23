import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/shell/avatar_url_identity.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Equal-width outlined pill used for Settings quick actions.
class SettingsPillButton extends StatelessWidget {
  const SettingsPillButton({
    required this.label,
    required this.onPressed,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final shape = StadiumBorder(
      side: BorderSide(color: theme.colorScheme.border),
    );
    return Material(
      color: SettingsRowLayout.groupFill(context),
      shape: shape,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onPressed,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            // One line; enlarged text scales down rather than breaking
            // mid-word.
            child: Center(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  label,
                  maxLines: 1,
                  softWrap: false,
                  style: theme.typography.base.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Circular avatar with an initial fallback.
class SettingsProfileAvatar extends StatelessWidget {
  const SettingsProfileAvatar({
    required this.url,
    required this.name,
    this.cacheKey,
    super.key,
  });

  static const double size = 64;

  final String? url;
  final String? cacheKey;
  final String name;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final initial = name.characters.first.toUpperCase();
    final fallback = ColoredBox(
      color: theme.colorScheme.muted,
      child: Center(
        child: Text(
          initial,
          style: theme.typography.xLarge.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
    );
    final source = url;
    return ClipOval(
      child: SizedBox.square(
        dimension: size,
        child: source == null
            ? fallback
            : Image(
                image: CachedNetworkImageProvider(
                  source,
                  cacheKey: cacheKey ?? avatarIdentityKeyForUrl(source),
                ),
                fit: BoxFit.cover,
                gaplessPlayback: true,
                errorBuilder: (_, _, _) => fallback,
              ),
      ),
    );
  }
}

/// Workspace count; opens the workspace list.
class SettingsWorkspaceStat extends StatelessWidget {
  const SettingsWorkspaceStat({
    required this.count,
    required this.radius,
    this.inline = false,
    super.key,
  });

  final int count;
  final BorderRadius radius;

  /// One line, "3 workspaces", under the identity row.
  final bool inline;

  static const _padding = 16.0;

  /// Width of the stacked stat at the current text scale.
  static double naturalWidth(BuildContext context, int count) {
    final theme = shad.Theme.of(context);
    double measure(String text, TextStyle style) =>
        SettingsRowLayout.textWidth(context, text, style);

    return _padding +
        [
          measure(
            '$count',
            theme.typography.large.copyWith(fontWeight: FontWeight.w700),
          ),
          measure(
            context.l10n.settingsProfileWorkspaceCount(count),
            theme.typography.small,
          ),
        ].reduce((a, b) => a > b ? a : b);
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final label = context.l10n.settingsProfileWorkspaceCount(count);
    return Semantics(
      button: true,
      label: '$count $label',
      excludeSemantics: true,
      child: InkWell(
        key: const ValueKey('settings-profile-workspaces'),
        borderRadius: radius,
        onTap: () => showWorkspacePickerSheet(context),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: inline
                ? Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: '$count ',
                          style: theme.typography.base.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        TextSpan(
                          text: label,
                          style: theme.typography.base.copyWith(
                            color: theme.colorScheme.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '$count',
                        style: theme.typography.large.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        label,
                        maxLines: 1,
                        softWrap: false,
                        style: theme.typography.small.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
