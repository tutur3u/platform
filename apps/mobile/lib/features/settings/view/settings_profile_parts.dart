import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/shell/avatar_url_identity.dart';
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
    this.size = 64,
    super.key,
  });

  final double size;

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
          style: (size < 56 ? theme.typography.large : theme.typography.xLarge)
              .copyWith(fontWeight: FontWeight.w700),
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
