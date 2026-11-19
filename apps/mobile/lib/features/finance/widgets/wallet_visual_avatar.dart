import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/finance/utils/wallet_images.dart';

class WalletVisualAvatar extends StatelessWidget {
  const WalletVisualAvatar({
    required this.fallbackIcon,
    this.icon,
    this.imageSrc,
    this.size = 36,
    this.backgroundColor,
    this.foregroundColor,
    super.key,
  });

  final String? icon;
  final String? imageSrc;
  final IconData fallbackIcon;
  final double size;
  final Color? backgroundColor;
  final Color? foregroundColor;

  @override
  Widget build(BuildContext context) {
    final colorScheme = context.tokens.colorScheme;
    final bg = backgroundColor ?? AppTone.primary.fill(colorScheme);
    final ink = foregroundColor ?? colorScheme.primary;
    final resolvedIcon = resolvePlatformIcon(icon, fallback: fallbackIcon);

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: bg),
      child: imageSrc == null
          ? Icon(resolvedIcon, size: size * 0.46, color: ink)
          : Padding(
              padding: EdgeInsets.all(size * 0.18),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppRadius.sm),
                child: SvgPicture.network(
                  walletImageUrl(imageSrc!),
                  placeholderBuilder: (_) =>
                      Icon(resolvedIcon, size: size * 0.46, color: ink),
                  errorBuilder: (context, error, stackTrace) =>
                      Icon(resolvedIcon, size: size * 0.46, color: ink),
                ),
              ),
            ),
    );
  }
}
