import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/utils/supported_timezones.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/settings/view/settings_scoped_sheet.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';

class TimezoneSettingsTile extends StatefulWidget {
  const TimezoneSettingsTile({
    required this.userId,
    required this.workspaceId,
    this.workspace = false,
    this.canManageWorkspace = false,
    this.grouped = false,
    super.key,
  });
  final String? userId;
  final String? workspaceId;
  final bool workspace;
  final bool canManageWorkspace;
  final bool grouped;
  @override
  State<TimezoneSettingsTile> createState() => _TimezoneSettingsTileState();
}

class _TimezoneSettingsTileState extends State<TimezoneSettingsTile> {
  late final TimezoneSettingsCubit _cubit;
  int _editorGeneration = 0;
  ModalRoute<dynamic>? _editorRoute;
  Timer? _cooldownTimer;
  DateTime? _retryAt;
  bool _coolingDown = false;
  @override
  void initState() {
    super.initState();
    _cubit = context.read<TimezoneSettingsCubit>();
    _syncCooldown(_cubit.state.retryAt);
  }

  void _syncCooldown(DateTime? retryAt) {
    if (_retryAt == retryAt) return;
    _retryAt = retryAt;
    _cooldownTimer?.cancel();
    final remaining = retryAt?.difference(DateTime.now());
    _coolingDown = remaining != null && remaining > Duration.zero;
    if (_coolingDown) {
      _cooldownTimer = Timer(remaining!, () {
        if (mounted) setState(() => _coolingDown = false);
      });
    }
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    super.dispose();
  }

  @override
  void didUpdateWidget(TimezoneSettingsTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.userId != widget.userId ||
        oldWidget.workspaceId != widget.workspaceId ||
        (oldWidget.canManageWorkspace && !widget.canManageWorkspace)) {
      _editorGeneration++;
      final route = _editorRoute;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final navigator = route?.navigator;
        if (navigator == null || route == null || !route.isActive) return;
        if (route.isCurrent) {
          navigator.pop();
        } else {
          navigator.removeRoute(route);
        }
      });
    }
  }

  Future<void> _load() => _cubit.reload();

  Future<void> _choose() async {
    if (widget.workspace && !widget.canManageWorkspace) return;
    final generation = ++_editorGeneration;
    final userId = widget.userId;
    final workspaceId = widget.workspaceId;
    final selected = await showScopedSettingsSheet<String>(
      context: context,
      maxDialogWidth: 480,
      builder: (sheetContext) {
        _editorRoute = ModalRoute.of(sheetContext);
        return _TimezoneChooser(workspace: widget.workspace);
      },
    );
    _editorRoute = null;
    if (!mounted ||
        generation != _editorGeneration ||
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
      BlocConsumer<TimezoneSettingsCubit, TimezoneSettingsState>(
        bloc: _cubit,
        listener: (_, state) => _syncCooldown(state.retryAt),
        builder: (context, state) => SettingsTile(
          grouped: widget.grouped,
          icon: Icons.public_rounded,
          title: widget.workspace
              ? context.l10n.settingsWorkspaceTimezone
              : context.l10n.settingsTimezone,
          subtitle: _coolingDown
              ? context.l10n.settingsTimezoneRateLimited
              : state.failed
              ? context.l10n.settingsTimezoneError
              : !state.resolved
              ? state.loading
                    ? context.l10n.settingsTimezoneLoading
                    : context.l10n.settingsTimezoneAccountPending
              : context.l10n.settingsTimezoneEffective(state.effective),
          value: state.loading || state.saving
              ? '…'
              : !(state.resolved ||
                    (widget.workspace
                        ? state.workspaceLoaded
                        : state.personalLoaded))
              ? context.l10n.settingsTimezoneUnknown
              : (widget.workspace ? state.workspace : state.personal) == 'auto'
              ? context.l10n.settingsTimezoneAuto
              : (widget.workspace ? state.workspace : state.personal),
          showChevron: !widget.workspace || widget.canManageWorkspace,
          onTap:
              _coolingDown ||
                  state.loading ||
                  state.saving ||
                  (!state.resolved && !state.failed)
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
    final zones = supportedTimezones
        .where(
          (zone) => zone.toLowerCase().replaceAll('_', ' ').contains(_query),
        )
        .toList();
    return AppDialogScaffold(
      title: widget.workspace
          ? context.l10n.settingsWorkspaceTimezone
          : context.l10n.settingsTimezone,
      slivers: [
        SliverToBoxAdapter(
          child: Material(
            type: MaterialType.transparency,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  decoration: InputDecoration(
                    hintText: context.l10n.settingsTimezoneSearch,
                  ),
                  onChanged: (value) => setState(
                    () => _query = value.trim().toLowerCase().replaceAll(
                      '_',
                      ' ',
                    ),
                  ),
                ),
                if (!widget.workspace)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(context.l10n.settingsTimezoneDescription),
                  ),
                ListTile(
                  title: Text(context.l10n.settingsTimezoneAuto),
                  onTap: () => Navigator.of(context).pop('auto'),
                ),
              ],
            ),
          ),
        ),
        SliverList.builder(
          itemCount: zones.length,
          itemBuilder: (context, index) {
            final zone = zones[index];
            return Material(
              type: MaterialType.transparency,
              child: ListTile(
                title: Text(zone),
                onTap: () => Navigator.of(context).pop(zone),
              ),
            );
          },
        ),
      ],
    );
  }
}
