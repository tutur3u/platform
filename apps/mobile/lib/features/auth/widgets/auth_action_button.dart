import 'package:flutter/material.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AuthLoadingIndicator extends StatelessWidget {
  const AuthLoadingIndicator({
    this.size = 18,
    this.strokeWidth = 2.2,
    super.key,
  });

  final double size;
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: size,
      child: shad.CircularProgressIndicator(strokeWidth: strokeWidth),
    );
  }
}

class AuthPrimaryButton extends StatelessWidget {
  const AuthPrimaryButton({
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.leading,
    this.expand = true,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final Widget? leading;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final button = shad.PrimaryButton(
      onPressed: isLoading ? null : onPressed,
      child: _AuthButtonContent(
        label: label,
        isLoading: isLoading,
        leading: leading,
      ),
    );

    if (!expand) {
      return button;
    }

    return SizedBox(width: double.infinity, child: button);
  }
}

class AuthSecondaryButton extends StatelessWidget {
  const AuthSecondaryButton({
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.leading,
    this.variant = AuthSecondaryButtonVariant.outline,
    this.expand = true,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final Widget? leading;
  final AuthSecondaryButtonVariant variant;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final child = _AuthButtonContent(
      label: label,
      isLoading: isLoading,
      leading: leading,
    );

    final button = switch (variant) {
      AuthSecondaryButtonVariant.outline => shad.OutlineButton(
        onPressed: isLoading ? null : onPressed,
        child: child,
      ),
      AuthSecondaryButtonVariant.ghost => shad.GhostButton(
        onPressed: isLoading ? null : onPressed,
        child: child,
      ),
    };

    if (!expand) {
      return button;
    }

    return SizedBox(width: double.infinity, child: button);
  }
}

enum AuthSecondaryButtonVariant { outline, ghost }

class _AuthButtonContent extends StatelessWidget {
  const _AuthButtonContent({
    required this.label,
    required this.isLoading,
    this.leading,
  });

  final String label;
  final bool isLoading;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return SizedBox(
      height: 22,
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (leading != null && !isLoading)
            Align(
              alignment: Alignment.centerLeft,
              child: SizedBox.square(
                dimension: 20,
                child: Center(child: leading),
              ),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Center(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 180),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                child: isLoading
                    ? const AuthLoadingIndicator(key: ValueKey('loading'))
                    : Text(
                        label,
                        key: const ValueKey('label'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
