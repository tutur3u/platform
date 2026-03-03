import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/features/finance/utils/wallet_images.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class WalletVisualAvatar extends StatelessWidget {
  const WalletVisualAvatar({
    required this.fallbackIcon,
    this.icon,
    this.imageSrc,
    this.size = 36,
    this.backgroundColor,
    super.key,
  });

  final String? icon;
  final String? imageSrc;
  final IconData fallbackIcon;
  final double size;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final colorScheme = shad.Theme.of(context).colorScheme;
    final bg = backgroundColor ?? colorScheme.primary.withValues(alpha: 0.14);
    final resolvedIcon = resolvePlatformIcon(icon, fallback: fallbackIcon);

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: bg),
      child: imageSrc == null
          ? Icon(
              resolvedIcon,
              size: size * 0.46,
              color: colorScheme.primary,
            )
          : Padding(
              padding: EdgeInsets.all(size * 0.18),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: SvgPicture.network(
                  walletImageUrl(imageSrc!),
                  placeholderBuilder: (_) => Icon(
                    resolvedIcon,
                    size: size * 0.46,
                    color: colorScheme.primary,
                  ),
                ),
              ),
            ),
    );
  }
}
