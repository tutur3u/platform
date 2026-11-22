import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

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
      child: NovaLoadingIndicator(size: size),
    );
  }
}

/// The step's main action: a full-width 48px primary button.
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
  Widget build(BuildContext context) => _AuthButton(
    variant: AppButtonVariant.primary,
    label: label,
    onPressed: onPressed,
    isLoading: isLoading,
    leading: leading,
    expand: expand,
  );
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
  Widget build(BuildContext context) => _AuthButton(
    variant: switch (variant) {
      AuthSecondaryButtonVariant.outline => AppButtonVariant.outline,
      AuthSecondaryButtonVariant.soft => AppButtonVariant.secondary,
      AuthSecondaryButtonVariant.ghost => AppButtonVariant.ghost,
    },
    label: label,
    onPressed: onPressed,
    isLoading: isLoading,
    leading: leading,
    expand: expand,
  );
}

enum AuthSecondaryButtonVariant { outline, soft, ghost }

class _AuthButton extends StatelessWidget {
  const _AuthButton({
    required this.variant,
    required this.label,
    required this.onPressed,
    required this.isLoading,
    required this.leading,
    required this.expand,
  });

  final AppButtonVariant variant;
  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final Widget? leading;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final button = AppButton(
      variant: variant,
      size: AppButtonSize.large,
      alignment: expand ? Alignment.center : null,
      onPressed: onPressed,
      loading: isLoading,
      leading: leading,
      child: Text(label, maxLines: 2, overflow: TextOverflow.ellipsis),
    );
    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }
}
