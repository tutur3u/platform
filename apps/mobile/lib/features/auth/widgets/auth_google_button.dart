import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
    return SizedBox(
      width: double.infinity,
      child: shad.OutlineButton(
        onPressed: isLoading ? null : onPressed,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(
              'assets/logos/google-logo.png',
              width: 20,
              height: 20,
            ),
            const shad.Gap(10),
            Flexible(
              child: Text(
                context.l10n.authContinueWithGoogle,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
      ),
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
