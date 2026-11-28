import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_controller.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

/// Settings › Privacy switch for sharing Mira content with Google Gemini.
///
/// The switch shows the server's answer; an unknown answer reads as off.
/// Turning it off stores a withdrawal, which stops new sends at once.
class MiraAiConsentSettingsTile extends StatefulWidget {
  const MiraAiConsentSettingsTile({required this.controller, super.key});

  final MiraAiConsentController controller;

  @override
  State<MiraAiConsentSettingsTile> createState() =>
      _MiraAiConsentSettingsTileState();
}

class _MiraAiConsentSettingsTileState extends State<MiraAiConsentSettingsTile> {
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    unawaited(widget.controller.refresh());
  }

  Future<void> _change(bool value) async {
    final saved = await widget.controller.setGranted(
      granted: value,
      source: MiraAiConsentSource.settings,
    );
    if (mounted) setState(() => _failed = !saved);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final controller = widget.controller;
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final consent = controller.consent;
        final granted = consent?.granted ?? false;
        final grantedAt = consent?.grantedAt;
        final enabled = !controller.busy;
        final row = SettingsTile(
          key: const ValueKey('settings-mira-ai-consent-row'),
          grouped: true,
          icon: LucideIcons.sparkles,
          title: l10n.miraConsentSettingsTitle,
          subtitle: _failed
              ? l10n.miraConsentSettingsError
              : granted && grantedAt != null
              ? l10n.miraConsentSettingsAllowedOn(
                  DateFormat.yMMMd(l10n.localeName).format(grantedAt.toLocal()),
                )
              : l10n.miraConsentSettingsSummary,
          wrapSupportingText: true,
          showChevron: false,
          onTap: enabled ? () => _change(!granted) : null,
          trailing: AppSwitch(
            key: const ValueKey('settings-mira-ai-consent-switch'),
            value: granted,
            semanticLabel: l10n.miraConsentSettingsTitle,
            onChanged: enabled ? _change : null,
          ),
        );
        final tokens = AppTokens.of(context);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            row,
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(
                SettingsRowLayout.textColumn,
                0,
                SettingsRowLayout.inset,
                12,
              ),
              child: Text(
                l10n.miraConsentSettingsFootnote,
                key: const ValueKey('settings-mira-ai-consent-footnote'),
                style: tokens.typography.small.copyWith(
                  color: tokens.colorScheme.mutedForeground,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
