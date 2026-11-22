import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/l10n/l10n.dart';

/// Sign in with Apple completes only through the native iOS sheet, so the
/// Apple button shows only there.
bool get authAppleSignInAvailable =>
    !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

class AuthGoogleButton extends StatelessWidget {
  const AuthGoogleButton({
    required this.isLoading,
    required this.onPressed,
    super.key,
  });

  final bool isLoading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => AuthSecondaryButton(
    label: context.l10n.authContinueWithGoogle,
    onPressed: isLoading ? null : onPressed,
    leading: SvgPicture.asset(
      'assets/logos/google.svg',
      width: 18,
      height: 18,
      excludeFromSemantics: true,
    ),
  );
}

/// One square provider button in [AuthProviderIconRow].
class AuthProviderIconButton extends StatelessWidget {
  const AuthProviderIconButton({
    required this.label,
    required this.onPressed,
    this.logoAssetPath,
    this.icon,
    super.key,
  }) : assert(logoAssetPath != null || icon != null, 'Give a logo or icon');

  final String label;
  final VoidCallback? onPressed;
  final String? logoAssetPath;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final mark = switch (logoAssetPath) {
      final path? => SvgPicture.asset(
        path,
        width: 18,
        height: 18,
        excludeFromSemantics: true,
        colorFilter: ColorFilter.mode(c.foreground, BlendMode.srcIn),
      ),
      null => Icon(icon, size: 18),
    };
    return Tooltip(
      message: label,
      excludeFromSemantics: true,
      child: AppButton.outline(
        size: AppButtonSize.large,
        alignment: Alignment.center,
        semanticLabel: label,
        onPressed: onPressed,
        child: mark,
      ),
    );
  }
}

/// Apple (iOS only), GitHub and, when [onQr] is set, QR sign-in as a row of
/// equal square buttons.
class AuthProviderIconRow extends StatelessWidget {
  const AuthProviderIconRow({
    required this.isLoading,
    required this.onApple,
    required this.onGithub,
    this.onQr,
    super.key,
  });

  final bool isLoading;
  final VoidCallback? onApple;
  final VoidCallback? onGithub;
  final VoidCallback? onQr;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    VoidCallback? guard(VoidCallback? action) => isLoading ? null : action;
    final buttons = [
      if (authAppleSignInAvailable)
        AuthProviderIconButton(
          key: const ValueKey('auth-provider-apple'),
          label: l10n.authContinueWithApple,
          logoAssetPath: 'assets/logos/apple.svg',
          onPressed: guard(onApple),
        ),
      AuthProviderIconButton(
        key: const ValueKey('auth-provider-github'),
        label: l10n.authContinueWithGithub,
        logoAssetPath: 'assets/logos/github.svg',
        onPressed: guard(onGithub),
      ),
      if (onQr case final qr?)
        AuthProviderIconButton(
          key: const ValueKey('auth-provider-qr'),
          label: l10n.qrLoginMobileButton,
          icon: LucideIcons.qrCode,
          onPressed: guard(qr),
        ),
    ];
    return Row(
      children: [
        for (final (index, button) in buttons.indexed) ...[
          if (index > 0) const SizedBox(width: AppSpacing.md),
          Expanded(child: button),
        ],
      ],
    );
  }
}

/// Google, then the provider icon row (sign-up has no QR option).
class AuthSocialButtons extends StatelessWidget {
  const AuthSocialButtons({
    required this.isLoading,
    required this.onGooglePressed,
    required this.onApplePressed,
    required this.onGithubPressed,
    this.onQrPressed,
    super.key,
  });

  final bool isLoading;
  final VoidCallback? onGooglePressed;
  final VoidCallback? onApplePressed;
  final VoidCallback? onGithubPressed;
  final VoidCallback? onQrPressed;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      AuthGoogleButton(isLoading: isLoading, onPressed: onGooglePressed),
      const AppGap(AppSpacing.md),
      AuthProviderIconRow(
        isLoading: isLoading,
        onApple: onApplePressed,
        onGithub: onGithubPressed,
        onQr: onQrPressed,
      ),
    ],
  );
}

/// A hairline with a short centred label ("or").
class AuthMethodDivider extends StatelessWidget {
  const AuthMethodDivider({this.label, super.key});

  final String? label;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    // Long labels wrap inside narrow form widths instead of overflowing.
    return LayoutBuilder(
      builder: (context, constraints) => Row(
        children: [
          Expanded(child: Divider(height: 1, color: c.border)),
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: constraints.maxWidth * 0.8),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
              child: Text(
                label ?? context.l10n.authContinueWithQr,
                textAlign: TextAlign.center,
                style: tokens.typography.caption.copyWith(
                  color: c.mutedForeground,
                ),
              ),
            ),
          ),
          Expanded(child: Divider(height: 1, color: c.border)),
        ],
      ),
    );
  }
}
