import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_switch.dart';
import 'package:mobile/core/ui/components/app_time_picker.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/features/mastermind/catchup/catchup_settings.dart';
import 'package:mobile/l10n/l10n.dart';

/// Catch-up settings, opened from the Today navbar. Above the dock, so the
/// last row is never covered.
Future<void> showCatchupSettingsSheet(
  BuildContext context, {
  MorningCatchupSettingsStore store = const MorningCatchupSettingsStore(),
}) => showAppSheet<void>(
  context: context,
  size: AppSheetSize.medium,
  useRootNavigator: true,
  builder: (context) => _CatchupSettingsSheet(store: store),
);

class _CatchupSettingsSheet extends StatefulWidget {
  const _CatchupSettingsSheet({required this.store});

  final MorningCatchupSettingsStore store;

  @override
  State<_CatchupSettingsSheet> createState() => _CatchupSettingsSheetState();
}

class _CatchupSettingsSheetState extends State<_CatchupSettingsSheet> {
  MorningCatchupSettings _settings = const MorningCatchupSettings();

  @override
  void initState() {
    super.initState();
    unawaited(
      widget.store.read().then((value) {
        if (mounted) setState(() => _settings = value);
      }),
    );
  }

  Future<void> _save(MorningCatchupSettings next) async {
    setState(() => _settings = next);
    await widget.store.write(next);
  }

  Future<void> _pickTime() async {
    final picked = await showAppTimePicker(
      context: context,
      initialTime: _settings.time,
    );
    if (picked != null && mounted) {
      await _save(_settings.copyWith(time: picked));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.mastermindCatchupSettingsAction,
      slivers: [
        SliverToBoxAdapter(
          child: AppGroupedSection(
            footer: l10n.mastermindMorningCatchupSubtitle,
            children: [
              AppGroupedRow(
                key: const ValueKey('catchup-morning-toggle'),
                leading: const AppIconTile(icon: LucideIcons.sunrise),
                title: Text(l10n.mastermindMorningCatchup),
                trailing: AppSwitch(
                  value: _settings.enabled,
                  semanticLabel: l10n.mastermindMorningCatchup,
                  onChanged: (value) =>
                      unawaited(_save(_settings.copyWith(enabled: value))),
                ),
                onTap: () => unawaited(
                  _save(_settings.copyWith(enabled: !_settings.enabled)),
                ),
              ),
              if (_settings.enabled)
                AppGroupedRow(
                  key: const ValueKey('catchup-morning-time'),
                  leading: const AppIconTile(icon: LucideIcons.clock),
                  title: Text(l10n.mastermindMorningCatchupTime),
                  trailing: Text(
                    MaterialLocalizations.of(context).formatTimeOfDay(
                      _settings.time,
                      alwaysUse24HourFormat: true,
                    ),
                  ),
                  showChevron: true,
                  onTap: () => unawaited(_pickTime()),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
