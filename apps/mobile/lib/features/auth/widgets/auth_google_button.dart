import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AuthSocialButton extends StatelessWidget {
  const AuthSocialButton({
    required this.label,
    required this.logoAssetPath,
    required this.isLoading,
    required this.onPressed,
    this.logoColor,
    super.key,
  });

  final String label;
  final String logoAssetPath;
  final bool isLoading;
  final Color? logoColor;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return AuthSecondaryButton(
      label: label,
      onPressed: onPressed,
      isLoading: isLoading,
      leading: SvgPicture.asset(
        logoAssetPath,
        width: 20,
        height: 20,
        colorFilter: logoColor == null
            ? null
            : ColorFilter.mode(logoColor!, BlendMode.srcIn),
      ),
    );
  }
}

class AuthGoogleButton extends StatelessWidget {
  const AuthGoogleButton({
    required this.isLoading,
    required this.onPressed,
    super.key,
  });

  final bool isLoading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return AuthSocialButton(
      label: context.l10n.authContinueWithGoogle,
      logoAssetPath: 'assets/logos/google.svg',
      isLoading: isLoading,
      onPressed: onPressed,
    );
  }
}

class AuthAppleButton extends StatelessWidget {
  const AuthAppleButton({
    required this.isLoading,
    required this.onPressed,
    super.key,
  });

  final bool isLoading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return AuthSocialButton(
      label: context.l10n.authContinueWithApple,
      logoAssetPath: 'assets/logos/apple.svg',
      isLoading: isLoading,
      onPressed: onPressed,
      logoColor: theme.colorScheme.foreground,
    );
  }
}

class AuthMethodDivider extends StatelessWidget {
  const AuthMethodDivider({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Row(
      children: [
        Expanded(
          child: Divider(color: theme.colorScheme.border),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            context.l10n.authContinueWithEmail,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ),
        Expanded(
          child: Divider(color: theme.colorScheme.border),
        ),
      ],
    );
  }
}
