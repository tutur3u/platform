import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart' show AppPageKind;
import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:mobile/core/platform/apple_store_policy.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/router/link_browser_preference.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/telemetry_consent/view/telemetry_consent_sections.dart';
import 'package:mobile/l10n/l10n.dart';

/// Where "Privacy details" opens: the public privacy notice.
Uri telemetryPrivacyUri(Locale locale) => Uri.https(
  'tuturuuu.com',
  locale.languageCode == 'vi' ? '/vi/privacy' : '/privacy',
);

/// One-time, full-screen analytics and crash report choice.
///
/// Allow (filled) and Don't allow (outlined) are full-width buttons of one
/// size, always on screen, and persist exactly like the Settings switch. The
/// route opens above the shell. Closing it with the back gesture counts as
/// "Don't allow", never as consent; the route leaves once an answer is
/// stored.
class TelemetryConsentPage extends StatefulWidget {
  const TelemetryConsentPage({super.key, this.preference, this.launch});

  final TelemetryPreference? preference;
  final MobileLinkLaunch? launch;

  @override
  State<TelemetryConsentPage> createState() => _TelemetryConsentPageState();
}

class _TelemetryConsentPageState extends State<TelemetryConsentPage> {
  bool _failed = false;

  TelemetryPreference get _preference =>
      widget.preference ?? TelemetryPreference.instance;

  Future<void> _answer({required bool allow}) async {
    try {
      await _preference.setEnabled(value: allow);
      if (mounted) setState(() => _failed = false);
    } on Object {
      if (mounted) setState(() => _failed = true);
    }
  }

  void _openPrivacy() => unawaited(
    openMobileLink(
      context,
      telemetryPrivacyUri(Localizations.localeOf(context)),
      launch: widget.launch,
      readPreference: isAppleStorePlatform()
          ? () async => LinkBrowserPreference.external
          : null,
    ),
  );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _preference.ready && !_preference.busy) {
          unawaited(_answer(allow: false));
        }
      },
      child: AppScaffold(
        backgroundColor: tokens.colorScheme.background,
        child: SafeArea(
          child: ListenableBuilder(
            listenable: _preference,
            builder: (context, _) {
              final enabled = _preference.ready && !_preference.busy;
              return Column(
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.xl,
                        AppSpacing.xxxl,
                        AppSpacing.xl,
                        AppSpacing.lg,
                      ),
                      child: _Measure(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const TelemetryConsentHeader(),
                            const SizedBox(height: AppSpacing.xxl),
                            const TelemetryConsentPoints(),
                            const SizedBox(height: AppSpacing.lg),
                            TelemetryConsentMore(onOpenPrivacy: _openPrivacy),
                          ],
                        ),
                      ),
                    ),
                  ),
                  // Both answers stay on screen at every text size and share
                  // one width and height; neither is preselected.
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.xl,
                      AppSpacing.md,
                      AppSpacing.xl,
                      AppSpacing.lg,
                    ),
                    child: _Measure(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (_failed) ...[
                            Semantics(
                              liveRegion: true,
                              child: Text(
                                l10n.settingsTelemetryError,
                                textAlign: TextAlign.center,
                                style: tokens.typography.small.copyWith(
                                  color: tokens.colorScheme.destructive,
                                ),
                              ),
                            ),
                            const SizedBox(height: AppSpacing.md),
                          ],
                          AppButton.primary(
                            size: AppButtonSize.large,
                            onPressed: enabled
                                ? () => _answer(allow: true)
                                : null,
                            child: Text(l10n.telemetryConsentAllow),
                          ),
                          const SizedBox(height: AppSpacing.md),
                          AppButton.outline(
                            size: AppButtonSize.large,
                            onPressed: enabled
                                ? () => _answer(allow: false)
                                : null,
                            child: Text(l10n.telemetryConsentDeny),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Keeps the prompt at the form measure on tablets and landscape.
class _Measure extends StatelessWidget {
  const _Measure({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth:
            AppLayout.maxContentWidth(AppPageKind.form, context.deviceClass) ??
            double.infinity,
      ),
      child: child,
    ),
  );
}
