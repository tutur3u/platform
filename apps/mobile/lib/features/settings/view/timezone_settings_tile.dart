import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/utils/supported_timezones.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';

class TimezoneSettingsTile extends StatefulWidget {
  const TimezoneSettingsTile({
    required this.userId,
    required this.workspaceId,
    this.workspace = false,
    this.canManageWorkspace = false,
    super.key,
  });
  final String? userId;
  final String? workspaceId;
  final bool workspace;
  final bool canManageWorkspace;
  @override
  State<TimezoneSettingsTile> createState() => _TimezoneSettingsTileState();
}

class _TimezoneSettingsTileState extends State<TimezoneSettingsTile> {
  late final TimezoneSettingsCubit _cubit;
  @override
  void initState() {
    super.initState();
    _cubit = context.read<TimezoneSettingsCubit>();
    unawaited(_load());
  }

  Future<void> _load() =>
      _cubit.load(userId: widget.userId, workspaceId: widget.workspaceId);
  @override
  void didUpdateWidget(TimezoneSettingsTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.userId != widget.userId ||
        oldWidget.workspaceId != widget.workspaceId) {
      unawaited(_load());
    }
  }

  Future<void> _choose() async {
    if (widget.workspace && !widget.canManageWorkspace) return;
    final userId = widget.userId;
    final workspaceId = widget.workspaceId;
    final selected = await showAdaptiveSheet<String>(
      context: context,
      maxDialogWidth: 480,
      builder: (_) => _TimezoneChooser(workspace: widget.workspace),
    );
    if (!mounted ||
        selected == null ||
        userId != widget.userId ||
        workspaceId != widget.workspaceId ||
        (widget.workspace && !widget.canManageWorkspace)) {
      return;
    }
    await _cubit.save(
      selected,
      workspace: widget.workspace,
      canManageWorkspace: widget.canManageWorkspace,
    );
  }

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<TimezoneSettingsCubit, TimezoneSettingsState>(
        bloc: _cubit,
        builder: (context, state) => SettingsTile(
          icon: Icons.public_rounded,
          title: widget.workspace
              ? context.l10n.settingsWorkspaceTimezone
              : context.l10n.settingsTimezone,
          subtitle: state.failed
              ? context.l10n.settingsTimezoneError
              : context.l10n.settingsTimezoneEffective(state.effective),
          value: state.loading || state.saving
              ? '…'
              : (widget.workspace ? state.workspace : state.personal) == 'auto'
              ? context.l10n.settingsTimezoneAuto
              : (widget.workspace ? state.workspace : state.personal),
          showChevron: !widget.workspace || widget.canManageWorkspace,
          onTap: state.loading || state.saving
              ? null
              : state.failed && !state.resolved
              ? () => unawaited(_load())
              : widget.workspace && !widget.canManageWorkspace
              ? null
              : () => unawaited(_choose()),
        ),
      );
}

class _TimezoneChooser extends StatefulWidget {
  const _TimezoneChooser({required this.workspace});
  final bool workspace;
  @override
  State<_TimezoneChooser> createState() => _TimezoneChooserState();
}

class _TimezoneChooserState extends State<_TimezoneChooser> {
  String _query = '';
  @override
  Widget build(BuildContext context) {
    final zones = supportedTimezones.where(
      (zone) => zone.toLowerCase().replaceAll('_', ' ').contains(_query),
    );
    return AppDialogScaffold(
      title: widget.workspace
          ? context.l10n.settingsWorkspaceTimezone
          : context.l10n.settingsTimezone,
      description: widget.workspace
          ? null
          : context.l10n.settingsTimezoneDescription,
      scrollable: false,
      child: Material(
        type: MaterialType.transparency,
        child: SizedBox(
          height: 360,
          child: Column(
            children: [
              TextField(
                decoration: InputDecoration(
                  hintText: context.l10n.settingsTimezoneSearch,
                ),
                onChanged: (value) => setState(
                  () =>
                      _query = value.trim().toLowerCase().replaceAll('_', ' '),
                ),
              ),
              Expanded(
                child: ListView(
                  children: [
                    ListTile(
                      title: Text(context.l10n.settingsTimezoneAuto),
                      onTap: () => Navigator.of(context).pop('auto'),
                    ),
                    for (final zone in zones)
                      ListTile(
                        title: Text(zone),
                        onTap: () => Navigator.of(context).pop(zone),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
