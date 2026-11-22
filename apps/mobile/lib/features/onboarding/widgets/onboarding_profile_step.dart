import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/widgets/auth_error_notice.dart';
import 'package:mobile/features/auth/widgets/auth_heading.dart';
import 'package:mobile/features/shell/view/account_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// Step 1, "Make it yours": photo, display name, language, appearance and
/// the separate product-news email opt-in.
class OnboardingProfileStep extends StatelessWidget {
  const OnboardingProfileStep({
    required this.identity,
    required this.nameController,
    required this.languageCode,
    required this.onLanguage,
    required this.themeMode,
    required this.onTheme,
    required this.productNews,
    this.onProductNews,
    this.onChangePhoto,
    this.photoBusy = false,
    this.photoError,
    this.nameError,
    super.key,
  });

  final AccountIdentity identity;
  final TextEditingController nameController;
  final String languageCode;
  final ValueChanged<String> onLanguage;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onTheme;
  final bool productNews;

  /// Null while no email preference exists to store the answer: the switch
  /// stays off and disabled with a "coming soon" note.
  final ValueChanged<bool>? onProductNews;
  final VoidCallback? onChangePhoto;
  final bool photoBusy;
  final String? photoError;
  final String? nameError;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Center(
          child: AppIllustration(AppIllustrationKind.profileCard, size: 180),
        ),
        const AppGap(AppSpacing.lg),
        AuthHeading(
          title: l10n.onboardingProfileTitle,
          subtitle: Text(l10n.onboardingProfileSubtitle),
          centered: false,
          large: true,
        ),
        const AppGap(AppSpacing.lg),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            _Photo(identity: identity, busy: photoBusy, onTap: onChangePhoto),
            const SizedBox(width: AppSpacing.md + 2),
            Expanded(
              child: AppTextField(
                key: const ValueKey('onboarding-display-name'),
                controller: nameController,
                label: l10n.onboardingDisplayName,
                placeholder: l10n.onboardingDisplayNamePlaceholder,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.name],
              ),
            ),
          ],
        ),
        for (final error in [?photoError, ?nameError]) ...[
          const AppGap(AppSpacing.sm),
          AuthInlineError(error, centered: false),
        ],
        const AppGap(AppSpacing.lg),
        DecoratedBox(
          decoration: BoxDecoration(
            color: c.card,
            borderRadius: BorderRadius.circular(tokens.shapes.card),
            border: Border.all(color: c.border),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: Column(
              children: [
                _Row(
                  label: l10n.onboardingLanguage,
                  divider: true,
                  trailing: SizedBox(
                    width: 112,
                    child: AppSegmentedControl<String>(
                      key: const ValueKey('onboarding-language'),
                      segments: const [
                        AppSegment(value: 'en', label: 'EN'),
                        AppSegment(value: 'vi', label: 'VI'),
                      ],
                      selected: languageCode,
                      onChanged: onLanguage,
                    ),
                  ),
                ),
                _Row(
                  label: l10n.onboardingAppearance,
                  divider: true,
                  // Grows into the row so "Tự động" fits; the label keeps
                  // at least [_Row.minLabelWidth].
                  trailingWidth: 236,
                  trailing: SizedBox(
                    width: double.infinity,
                    child: AppSegmentedControl<ThemeMode>(
                      key: const ValueKey('onboarding-appearance'),
                      segments: [
                        AppSegment(
                          value: ThemeMode.light,
                          label: l10n.onboardingThemeLight,
                        ),
                        AppSegment(
                          value: ThemeMode.dark,
                          label: l10n.onboardingThemeDark,
                        ),
                        AppSegment(
                          value: ThemeMode.system,
                          label: l10n.onboardingThemeAuto,
                        ),
                      ],
                      selected: themeMode,
                      onChanged: onTheme,
                    ),
                  ),
                ),
                _Row(
                  label: l10n.onboardingProductNews,
                  detail: onProductNews == null
                      ? l10n.onboardingProductNewsSoon
                      : l10n.onboardingProductNewsOff,
                  trailing: AppSwitch(
                    key: const ValueKey('onboarding-product-news'),
                    value: productNews,
                    onChanged: onProductNews,
                    semanticLabel: l10n.onboardingProductNews,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Photo extends StatelessWidget {
  const _Photo({required this.identity, required this.busy, this.onTap});

  final AccountIdentity identity;
  final bool busy;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Padding(
    // Lines the avatar up with the field rather than its label.
    padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
    child: SizedBox(
      width: 72,
      height: 72,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          AccountAvatar(identity: identity, size: 64),
          if (onTap != null)
            PositionedDirectional(
              end: -6,
              bottom: -6,
              child: AppButton(
                variant: AppButtonVariant.outline,
                size: AppButtonSize.small,
                density: AppButtonDensity.icon,
                shape: AppButtonShape.circle,
                loading: busy,
                onPressed: onTap,
                semanticLabel: context.l10n.onboardingChangePhoto,
                child: const Icon(LucideIcons.camera),
              ),
            ),
        ],
      ),
    ),
  );
}

class _Row extends StatelessWidget {
  const _Row({
    required this.label,
    required this.trailing,
    this.detail,
    this.divider = false,
    this.trailingWidth,
  });

  static const minLabelWidth = 80.0;

  /// Preferred width of [trailing]; it shrinks to leave the label room.
  final double? trailingWidth;

  final String label;
  final String? detail;
  final Widget trailing;
  final bool divider;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return Container(
      constraints: const BoxConstraints(minHeight: 56),
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      decoration: divider
          ? BoxDecoration(
              border: Border(bottom: BorderSide(color: c.border)),
            )
          : null,
      child: LayoutBuilder(
        builder: (context, constraints) =>
            _content(tokens, constraints.maxWidth),
      ),
    );
  }

  Widget _content(AppTokens tokens, double rowWidth) {
    final c = tokens.colorScheme;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: tokens.typography.ui.copyWith(color: c.foreground),
              ),
              if (detail case final text?)
                Text(
                  text,
                  style: tokens.typography.caption.copyWith(
                    color: c.mutedForeground,
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        if (trailingWidth case final width?)
          SizedBox(
            width: width.clamp(0, rowWidth - minLabelWidth - AppSpacing.md),
            child: trailing,
          )
        else
          trailing,
      ],
    );
  }
}
