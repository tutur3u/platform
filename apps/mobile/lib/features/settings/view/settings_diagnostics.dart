import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/observability/mobile_diagnostics.dart';
import 'package:mobile/core/observability/mobile_observability.dart';
import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:share_plus/share_plus.dart';

/// Entry from Settings > About. The app session retains access and simulation
/// until the mode is closed or the account changes.
class SettingsDiagnostics extends StatefulWidget {
  const SettingsDiagnostics({required this.version, super.key});

  final String version;

  @override
  State<SettingsDiagnostics> createState() => _SettingsDiagnosticsState();
}

class _SettingsDiagnosticsState extends State<SettingsDiagnostics> {
  final MobileDiagnostics _diagnostics = MobileDiagnostics.instance;
  int _versionTaps = 0;
  late bool _shown = _diagnostics.debugUnlocked;
  int _surfaceGeneration = 0;
  bool _sending = false;
  String? _feedback;

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _feedback = null;
    });
    final l10n = context.l10n;
    final generation = _surfaceGeneration;
    String feedback;
    try {
      final accepted = await MobileObservability.instance.sendDiagnostics();
      feedback = accepted
          ? l10n.settingsDiagnosticQueued
          : l10n.settingsDiagnosticSendUnavailable;
    } on Object {
      feedback = l10n.settingsDiagnosticActionFailed;
    }
    if (!mounted || !_shown || generation != _surfaceGeneration) return;
    setState(() {
      _sending = false;
      _feedback = feedback;
    });
  }

  Future<void> _export() async {
    final l10n = context.l10n;
    final box = context.findRenderObject() as RenderBox?;
    try {
      await SharePlus.instance.share(
        ShareParams(
          text: _diagnostics.export(),
          title: l10n.settingsDiagnosticExport,
          sharePositionOrigin: box == null || !box.hasSize
              ? null
              : box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } on Object {
      if (mounted && _shown) {
        setState(() => _feedback = l10n.settingsDiagnosticActionFailed);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final auth = context.watch<AuthCubit?>();
    final user = auth?.state.user;
    final accountAvailable = auth?.state.status == AuthStatus.authenticated;
    final internal =
        accountAvailable &&
        user?.appMetadata['mobile_diagnostics_access'] == true;

    Widget body() => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SettingsTile(
          grouped: true,
          icon: LucideIcons.info,
          title: l10n.settingsAppVersion,
          value: widget.version,
          subtitle: l10n.settingsVersionTileDescription,
          showChevron: false,
          onTap: accountAvailable
              ? () {
                  if (++_versionTaps < 7) return;
                  setState(() {
                    _versionTaps = 0;
                    _shown = true;
                    _diagnostics.debugUnlocked = true;
                  });
                }
              : null,
        ),
        if (internal || _shown)
          SettingsTile(
            grouped: true,
            icon: LucideIcons.bug,
            title: l10n.settingsDiagnostics,
            onTap: () {
              setState(() {
                _surfaceGeneration++;
                _shown = !_shown;
                _versionTaps = 0;
                _feedback = null;
                _sending = false;
              });
              if (_shown) {
                _diagnostics.debugUnlocked = true;
              } else {
                _diagnostics.lockDebugMode();
              }
            },
          ),
        if (_shown && accountAvailable && user != null)
          _buildDetails(context, user.id),
      ],
    );

    if (auth == null) return body();
    return BlocListener<AuthCubit, AuthState>(
      listenWhen: (previous, current) =>
          previous.user?.id != current.user?.id ||
          previous.status != current.status,
      listener: (context, _) {
        setState(() {
          _surfaceGeneration++;
          _shown = false;
          _versionTaps = 0;
          _feedback = null;
          _sending = false;
        });
      },
      child: body(),
    );
  }

  Widget _buildDetails(BuildContext context, String userId) {
    final l10n = context.l10n;
    final workspaceId = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    final experiments = context.watch<ExperimentalAppsCubit?>()?.state;
    final flags = [
      for (final module in AppRegistry.experimentalModules)
        if (experiments?.isEnabled(module.id) ?? false) module.id,
    ]..sort();
    return ListenableBuilder(
      listenable: _diagnostics,
      builder: (context, _) => Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _detail(l10n.settingsDiagnosticEnvironment, ApiConfig.flavor.value),
            _detail(l10n.settingsAppVersion, widget.version),
            _detail(l10n.settingsDiagnosticUser, userId),
            _detail(l10n.settingsDiagnosticWorkspace, workspaceId ?? '—'),
            _detail(l10n.settingsDiagnosticFlags, flags.join(', ')),
            AppDisclosure(
              title: Text(l10n.settingsDiagnosticOrigins),
              children: [
                for (final entry in ApiConfig.diagnosticOrigins.entries)
                  _detail(entry.key, entry.value),
              ],
            ),
            _toggleTile(
              icon: LucideIcons.list,
              title: l10n.settingsDiagnosticVerbose,
              enabled: _diagnostics.verbose,
              onChanged: (value) => _diagnostics.setVerbose(enabled: value),
            ),
            _toggleTile(
              icon: LucideIcons.timer,
              title: l10n.settingsDiagnosticSlowNetwork,
              enabled: _diagnostics.slowNetwork,
              onChanged: (value) => _diagnostics.setSlowNetwork(enabled: value),
            ),
            _entries(l10n.settingsDiagnosticNetwork, [
              for (final event in _diagnostics.requests) event.summary,
            ]),
            _entries(l10n.settingsDiagnosticLogs, _diagnostics.logs),
            SettingsTile(
              grouped: true,
              icon: LucideIcons.share,
              title: l10n.settingsDiagnosticExport,
              onTap: _export,
            ),
            ListenableBuilder(
              listenable: TelemetryPreference.instance,
              builder: (context, _) => SettingsTile(
                grouped: true,
                icon: LucideIcons.send,
                title: l10n.settingsDiagnosticSend,
                subtitle:
                    _feedback ??
                    (MobileObservability.instance.enabled
                        ? null
                        : l10n.settingsDiagnosticOptInFirst),
                onTap: MobileObservability.instance.enabled && !_sending
                    ? _send
                    : null,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _entries(String title, List<String> entries) => AppDisclosure(
    title: Text(title),
    children: [
      if (entries.isEmpty) Text(context.l10n.settingsDiagnosticEmpty),
      for (final entry in entries)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: SelectableText(entry),
        ),
    ],
  );

  Widget _detail(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: SelectableText('$label\n${value.isEmpty ? '—' : value}'),
  );
}

Widget _toggleTile({
  required IconData icon,
  required String title,
  required bool enabled,
  required ValueChanged<bool>? onChanged,
  String? subtitle,
}) => SettingsTile(
  grouped: true,
  icon: icon,
  title: title,
  subtitle: subtitle,
  showChevron: false,
  onTap: onChanged == null ? null : () => onChanged(!enabled),
  trailing: AppSwitch(
    value: enabled,
    onChanged: onChanged,
    semanticLabel: title,
  ),
);
