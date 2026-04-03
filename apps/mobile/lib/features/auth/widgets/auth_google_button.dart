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

class AuthMicrosoftButton extends StatelessWidget {
  const AuthMicrosoftButton({
    required this.isLoading,
    required this.onPressed,
    super.key,
  });

  final bool isLoading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return AuthSocialButton(
      label: context.l10n.authContinueWithMicrosoft,
      logoAssetPath: 'assets/logos/microsoft.svg',
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

class AuthGithubButton extends StatelessWidget {
  const AuthGithubButton({
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
      label: context.l10n.authContinueWithGithub,
      logoAssetPath: 'assets/logos/github.svg',
      isLoading: isLoading,
      onPressed: onPressed,
      logoColor: theme.colorScheme.foreground,
    );
  }
}

class AuthSocialButtons extends StatelessWidget {
  const AuthSocialButtons({
    required this.isLoading,
    required this.onGooglePressed,
    required this.onMicrosoftPressed,
    required this.onApplePressed,
    required this.onGithubPressed,
    super.key,
  });

  final bool isLoading;
  final VoidCallback? onGooglePressed;
  final VoidCallback? onMicrosoftPressed;
  final VoidCallback? onApplePressed;
  final VoidCallback? onGithubPressed;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AuthGoogleButton(
          isLoading: isLoading,
          onPressed: onGooglePressed,
        ),
        const shad.Gap(12),
        AuthMicrosoftButton(
          isLoading: isLoading,
          onPressed: onMicrosoftPressed,
        ),
        const shad.Gap(12),
        AuthAppleButton(
          isLoading: isLoading,
          onPressed: onApplePressed,
        ),
        const shad.Gap(12),
        AuthGithubButton(
          isLoading: isLoading,
          onPressed: onGithubPressed,
        ),
      ],
    );
  }
}

class AuthMethodDivider extends StatelessWidget {
  const AuthMethodDivider({
    this.label,
    super.key,
  });

  final String? label;

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
            label ?? context.l10n.authContinueWithEmail,
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
