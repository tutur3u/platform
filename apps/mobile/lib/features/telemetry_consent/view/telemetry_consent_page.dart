import 'package:flutter/material.dart' hide Scaffold;
import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Where "Learn more" opens: the public privacy notice.
final telemetryPrivacyUri = Uri.parse('https://tuturuuu.com/privacy');

/// One-time, full-screen analytics and crash report choice.
///
/// Both answers carry equal weight and persist exactly like the Settings
/// switch. The route opens above the shell and has no dismiss action: it
/// leaves only once an explicit choice is stored.
class TelemetryConsentPage extends StatefulWidget {
  const TelemetryConsentPage({super.key, this.preference, this.openLink});

  final TelemetryPreference? preference;
  final Future<bool> Function(BuildContext context, Uri uri)? openLink;

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

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final textTheme = Theme.of(context).textTheme;
    return PopScope(
      canPop: false,
      child: shad.Scaffold(
        child: SafeArea(
          child: ListenableBuilder(
            listenable: _preference,
            builder: (context, _) {
              final enabled = _preference.ready && !_preference.busy;
              return Column(
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(AppSpacing.lg),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(LucideIcons.shield, size: 40),
                          const SizedBox(height: AppSpacing.md),
                          Semantics(
                            header: true,
                            child: Text(
                              l10n.telemetryConsentTitle,
                              style: textTheme.headlineSmall,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.md),
                          Text(l10n.telemetryConsentBody),
                          const SizedBox(height: AppSpacing.md),
                          Text(l10n.telemetryConsentCollected),
                          const SizedBox(height: AppSpacing.md),
                          Text(l10n.telemetryConsentSettingsNote),
                          const SizedBox(height: AppSpacing.sm),
                          AppButton.ghost(
                            onPressed: () =>
                                (widget.openLink ?? openMobileLink)(
                                  context,
                                  telemetryPrivacyUri,
                                ),
                            child: Text(l10n.telemetryConsentLearnMore),
                          ),
                          if (_failed) ...[
                            const SizedBox(height: AppSpacing.sm),
                            Text(
                              l10n.settingsTelemetryError,
                              style: textTheme.bodyMedium?.copyWith(
                                color: Theme.of(context).colorScheme.error,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        AppButton.outline(
                          onPressed: enabled
                              ? () => _answer(allow: true)
                              : null,
                          child: Text(l10n.telemetryConsentAllow),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        AppButton.outline(
                          onPressed: enabled
                              ? () => _answer(allow: false)
                              : null,
                          child: Text(l10n.telemetryConsentDeny),
                        ),
                      ],
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
