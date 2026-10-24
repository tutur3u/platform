import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, OutlinedButton, TextField;
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'threshold_settings_rows.dart';

class ThresholdSettingsDialog extends StatefulWidget {
  const ThresholdSettingsDialog({
    required this.currentThreshold,
    required this.currentStatusChangeGracePeriodMinutes,
    required this.onSave,
    super.key,
  });

  final int? currentThreshold;
  final int currentStatusChangeGracePeriodMinutes;
  final Future<void> Function(
    int? threshold,
    int statusChangeGracePeriodMinutes,
  )
  onSave;

  @override
  State<ThresholdSettingsDialog> createState() =>
      _ThresholdSettingsDialogState();
}

class _ThresholdSettingsDialogState extends State<ThresholdSettingsDialog> {
  late final TextEditingController _thresholdController;
  late final TextEditingController _statusChangeGracePeriodController;
  late bool _noApprovalNeeded;
  bool _isSaving = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = AppTokens.of(context);
    final muted = theme.typography.small.copyWith(
      color: theme.colorScheme.mutedForeground,
    );
    return AppDialogScaffold(
      title: l10n.settingsApprovalThreshold,
      description: l10n.timerRequestsThresholdDescription,
      icon: LucideIcons.clipboardCheck,
      maxWidth: 520,
      actions: [
        shad.OutlineButton(
          onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _isSaving ? null : _handleSave,
          child: _isSaving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: NovaLoadingIndicator(size: 20),
                )
              : Text(l10n.timerSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SettingsGroup(
            children: [
              _ThresholdRow(
                title: l10n.settingsRequireApproval,
                subtitle: _noApprovalNeeded
                    ? l10n.timerRequestsThresholdNoApprovalHint
                    : null,
                trailing: shad.Switch(
                  value: !_noApprovalNeeded,
                  onChanged: _isSaving
                      ? null
                      : (value) => setState(() {
                          _noApprovalNeeded = !value;
                          _error = null;
                        }),
                ),
              ),
              if (!_noApprovalNeeded)
                _ThresholdRow(
                  title: l10n.settingsApprovalOlderThan,
                  trailing: _NumberField(
                    controller: _thresholdController,
                    unit: l10n.settingsDaysUnit,
                    placeholder: '1',
                    enabled: !_isSaving,
                  ),
                ),
              _ThresholdRow(
                title: l10n.settingsStatusChangeWindow,
                trailing: _NumberField(
                  controller: _statusChangeGracePeriodController,
                  unit: l10n.settingsMinutesUnit,
                  placeholder: '0',
                  enabled: !_isSaving,
                ),
              ),
            ],
          ),
          const AppGap(8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              [
                if (!_noApprovalNeeded) l10n.timerRequestsThresholdHelp,
                l10n.timerRequestsStatusChangeGracePeriodHelp,
              ].join(' '),
              style: muted,
            ),
          ),
          if (_error != null) ...[
            const AppGap(8),
            Text(
              _error!,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.destructive,
              ),
            ),
          ],
        ],
      ),
    );
  }

  @override
  void dispose() {
    _thresholdController.dispose();
    _statusChangeGracePeriodController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _noApprovalNeeded = widget.currentThreshold == null;
    _thresholdController = TextEditingController(
      text: widget.currentThreshold?.toString() ?? '1',
    );
    _statusChangeGracePeriodController = TextEditingController(
      text: widget.currentStatusChangeGracePeriodMinutes.toString(),
    );
  }

  Future<void> _handleSave() async {
    final threshold = _parseThreshold();
    if (!_noApprovalNeeded && threshold == null) {
      setState(() => _error = context.l10n.timerRequestsThresholdInvalid);
      return;
    }

    final statusChangeGracePeriodMinutes = _parseStatusChangeGracePeriod();
    if (statusChangeGracePeriodMinutes == null) {
      setState(
        () => _error = context.l10n.timerRequestsStatusChangeGracePeriodInvalid,
      );
      return;
    }

    setState(() {
      _isSaving = true;
      _error = null;
    });

    var shouldCloseDialog = false;

    try {
      await widget.onSave(
        _noApprovalNeeded ? null : threshold,
        statusChangeGracePeriodMinutes,
      );
      shouldCloseDialog = true;
    } on Exception catch (error) {
      if (!mounted) {
        return;
      }

      final message = error.toString().trim();
      setState(() {
        _error = message.isNotEmpty
            ? message
            : context.l10n.commonSomethingWentWrong;
      });
      return;
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }

    if (!mounted || !shouldCloseDialog) {
      return;
    }

    Navigator.of(context).pop();
  }

  int? _parseThreshold() {
    final value = int.tryParse(_thresholdController.text.trim());
    if (value == null || value < 0) {
      return null;
    }
    return value;
  }

  int? _parseStatusChangeGracePeriod() {
    final value = int.tryParse(_statusChangeGracePeriodController.text.trim());
    if (value == null || value < 0) {
      return null;
    }
    return value;
  }
}
