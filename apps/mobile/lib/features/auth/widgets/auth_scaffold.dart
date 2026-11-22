import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/widgets/auth_heading.dart';

export 'package:mobile/features/auth/widgets/auth_heading.dart';

/// Frame of every sign-in screen: a full-screen flow above the shell.
///
/// The Material scaffold consumes the keyboard inset once; SafeArea consumes
/// the system insets, so the form insets add no dock clearance. [bottomAction]
/// sits under the scroll view, so it stays visible above the keyboard while
/// the form scrolls. [footer] rests at the bottom of a short page.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({
    required this.child,
    this.title,
    this.subtitle,
    this.illustration,
    this.hero,
    this.footer,
    this.bottomAction,
    this.showBackButton = false,
    this.backButtonLabel,
    this.onBack,
    this.showLogo = true,
    super.key,
  });

  final Widget child;
  final String? title;
  final Widget? subtitle;

  /// A centred scene above the title (OTP, MFA and help screens).
  final AppIllustrationKind? illustration;

  /// A band above the title, such as [AuthHeroBand]; replaces the logo.
  final Widget? hero;
  final Widget? footer;

  /// The step's main action, kept reachable above the keyboard.
  final Widget? bottomAction;
  final bool showBackButton;

  /// Shown next to the back chevron (for example "Home").
  final String? backButtonLabel;
  final VoidCallback? onBack;

  /// The brand mark when there is no [hero] or [illustration].
  final bool showLogo;

  /// Widest the form column grows on tablets.
  static const maxFormWidth = 440.0;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final centered = hero == null;

    return Scaffold(
      backgroundColor: c.background,
      resizeToAvoidBottomInset: true,
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: c.isDark
            ? SystemUiOverlayStyle.light
            : SystemUiOverlayStyle.dark,
        child: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final insets = AppPageInsets.of(
                      context,
                      width: constraints.maxWidth,
                      kind: AppPageKind.form,
                      topInset: showBackButton ? AppSpacing.xs : AppSpacing.lg,
                    );
                    // Centre the form column on wide screens with padding,
                    // so the column keeps the full page height and the
                    // footer can rest at the bottom.
                    final room =
                        constraints.maxWidth - insets.horizontal - maxFormWidth;
                    final side = room > 0 ? room / 2 : 0.0;
                    return SingleChildScrollView(
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: insets.add(
                        EdgeInsets.symmetric(horizontal: side),
                      ),
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          minHeight: constraints.maxHeight - insets.vertical,
                        ),
                        child: _content(context, centered: centered),
                      ),
                    );
                  },
                ),
              ),
              if (bottomAction case final action?)
                ColoredBox(
                  color: c.background,
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(
                        maxWidth: maxFormWidth + 2 * AppSpacing.md,
                      ),
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(
                          AppSpacing.md,
                          AppSpacing.sm,
                          AppSpacing.md,
                          AppSpacing.sm,
                        ),
                        child: action,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _content(BuildContext context, {required bool centered}) {
    final head = <Widget>[
      if (showBackButton)
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: AuthBackButton(
            label: backButtonLabel,
            onPressed: onBack ?? () => Navigator.of(context).maybePop(),
          ),
        ),
      if (hero case final band?) band,
      if (illustration case final kind?)
        // Step scenes stay still; only the welcome hero moves.
        Center(child: AppIllustration(kind, size: 150, cycles: 0))
      else if (hero == null && showLogo)
        Center(
          child: Image.asset(
            'assets/logos/transparent.png',
            width: 48,
            height: 48,
            excludeFromSemantics: true,
          ),
        ),
      if (title != null || subtitle != null)
        AuthHeading(title: title, subtitle: subtitle, centered: centered),
    ];
    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final widget in head) ...[widget, const AppGap(AppSpacing.md)],
        child,
      ],
    );
    final foot = footer == null
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(top: AppSpacing.lg),
            child: footer,
          );
    // Tablets centre the form in the page; phones start it at the top.
    // Either way the footer rests at the bottom of a short page.
    final roomy = MediaQuery.sizeOf(context).shortestSide >= 600;
    return Column(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [if (roomy) const SizedBox.shrink(), body, foot],
    );
  }
}
