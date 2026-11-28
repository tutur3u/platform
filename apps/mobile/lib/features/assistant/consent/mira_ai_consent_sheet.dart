import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/platform/apple_store_policy.dart';
import 'package:mobile/core/router/link_browser_preference.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_controller.dart';
import 'package:mobile/l10n/l10n.dart';

/// The public privacy notice the consent sheet links to.
final miraAiConsentPrivacyUri = Uri.https('tuturuuu.com', '/privacy');

/// Resolves true when Mira may send to Google Gemini for the signed-in user.
///
/// A held grant answers at once. While the answer is unknown the server is
/// asked first; without a grant the disclosure sheet opens, and only an
/// Allow the server stored resolves true. Not now, dismissing the sheet or a
/// failed save resolves false and sends nothing.
Future<bool> ensureMiraAiConsent(
  BuildContext context,
  MiraAiConsentController controller, {
  MobileLinkLaunch? launch,
}) async {
  if (controller.granted) return true;
  if (await controller.ensureKnown()) return true;
  if (!context.mounted) return false;
  return controller.prompt(() async {
    final allowed = await showAppSheet<bool>(
      context: context,
      builder: (_) =>
          MiraAiConsentSheet(controller: controller, launch: launch),
    );
    return (allowed ?? false) && controller.granted;
  });
}

/// The disclosure and consent sheet shown before Mira first sends anything.
class MiraAiConsentSheet extends StatefulWidget {
  const MiraAiConsentSheet({required this.controller, this.launch, super.key});

  final MiraAiConsentController controller;
  final MobileLinkLaunch? launch;

  @override
  State<MiraAiConsentSheet> createState() => _MiraAiConsentSheetState();
}

class _MiraAiConsentSheetState extends State<MiraAiConsentSheet> {
  bool _failed = false;

  Future<void> _allow() async {
    setState(() => _failed = false);
    final saved = await widget.controller.setGranted(
      granted: true,
      source: MiraAiConsentSource.miraPrompt,
    );
    if (!mounted) return;
    if (saved && widget.controller.granted) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _failed = true);
    }
  }

  void _openPrivacy() => unawaited(
    openMobileLink(
      context,
      miraAiConsentPrivacyUri,
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
    final c = tokens.colorScheme;
    final muted = tokens.typography.small.copyWith(
      color: c.mutedForeground,
      height: 1.45,
    );
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final busy = widget.controller.busy;
        return AppSheetScaffold(
          key: const ValueKey('mira-consent-sheet'),
          title: l10n.miraConsentTitle,
          icon: LucideIcons.shieldCheck,
          showCloseButton: false,
          actions: [
            SizedBox(
              width: double.infinity,
              child: AppButton.primary(
                key: const ValueKey('mira-consent-allow'),
                loading: busy,
                onPressed: busy ? null : _allow,
                child: Text(l10n.miraConsentAllow),
              ),
            ),
            SizedBox(
              width: double.infinity,
              child: AppButton.ghost(
                key: const ValueKey('mira-consent-not-now'),
                onPressed: busy ? null : () => Navigator.of(context).pop(false),
                child: Text(l10n.miraConsentNotNow),
              ),
            ),
          ],
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.miraConsentBody,
                style: tokens.typography.p.copyWith(height: 1.45),
              ),
              const SizedBox(height: AppSpacing.md),
              _MiraAiConsentSentCard(muted: muted),
              const SizedBox(height: AppSpacing.md),
              Text(l10n.miraConsentWhy, style: muted),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: AppButton.ghost(
                  key: const ValueKey('mira-consent-privacy'),
                  density: AppButtonDensity.compact,
                  trailing: const Icon(LucideIcons.externalLink, size: 14),
                  onPressed: _openPrivacy,
                  child: Text(l10n.miraConsentPrivacyPolicy),
                ),
              ),
              if (_failed) ...[
                const SizedBox(height: AppSpacing.sm),
                AppAlert.destructive(
                  key: const ValueKey('mira-consent-error'),
                  content: Text(l10n.miraConsentSaveFailed),
                ),
              ],
              const SizedBox(height: AppSpacing.md),
            ],
          ),
        );
      },
    );
  }
}

class _MiraAiConsentSentCard extends StatelessWidget {
  const _MiraAiConsentSentCard({required this.muted});

  final TextStyle muted;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final rows = [
      (
        LucideIcons.messageSquareText,
        l10n.miraConsentText,
        l10n.miraConsentTextDetail,
      ),
      (LucideIcons.mic, l10n.miraConsentVoice, l10n.miraConsentVoiceDetail),
      (
        LucideIcons.camera,
        l10n.miraConsentCamera,
        l10n.miraConsentCameraDetail,
      ),
      (
        LucideIcons.monitorUp,
        l10n.miraConsentScreen,
        l10n.miraConsentScreenDetail,
      ),
    ];
    return AppCard(
      key: const ValueKey('mira-consent-sent'),
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.miraConsentWhatIsSent, style: tokens.typography.label),
          for (final (icon, title, detail) in rows) ...[
            const SizedBox(height: AppSpacing.sm),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, size: 18, color: tokens.colorScheme.foreground),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: '$title  ',
                          style: tokens.typography.small.copyWith(
                            fontWeight: FontWeight.w600,
                            color: tokens.colorScheme.foreground,
                          ),
                        ),
                        TextSpan(text: detail, style: muted),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
