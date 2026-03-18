import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, OutlinedButton, TextField;
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
    final theme = shad.Theme.of(context);
    final barrierColor = Theme.of(
      context,
    ).colorScheme.scrim.withValues(alpha: 0.55);
    return shad.AlertDialog(
      barrierColor: barrierColor,
      title: Text(l10n.timerRequestsThresholdTitle),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.timerRequestsThresholdDescription,
              style: theme.typography.textMuted,
            ),
            const shad.Gap(16),
            Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.timerRequestsThresholdNoApproval,
                    style: theme.typography.small,
                  ),
                ),
                shad.Switch(
                  value: _noApprovalNeeded,
                  onChanged: _isSaving
                      ? null
                      : (value) {
                          setState(() {
                            _noApprovalNeeded = value;
                            _error = null;
                          });
                        },
                ),
              ],
            ),
            if (_noApprovalNeeded) ...[
              const shad.Gap(8),
              Text(
                l10n.timerRequestsThresholdNoApprovalHint,
                style: theme.typography.textMuted,
              ),
            ] else ...[
              const shad.Gap(12),
              Text(
                l10n.timerRequestsThresholdLabel,
                style: theme.typography.small,
              ),
              const shad.Gap(4),
              shad.TextField(
                controller: _thresholdController,
                keyboardType: TextInputType.number,
                placeholder: const Text('1'),
                enabled: !_isSaving,
              ),
              const shad.Gap(8),
              Text(
                l10n.timerRequestsThresholdHelp,
                style: theme.typography.textMuted,
              ),
            ],
            const shad.Gap(12),
            Text(
              l10n.timerRequestsStatusChangeGracePeriodLabel,
              style: theme.typography.small,
            ),
            const shad.Gap(4),
            shad.TextField(
              controller: _statusChangeGracePeriodController,
              keyboardType: TextInputType.number,
              hintText: '0',
              enabled: !_isSaving,
            ),
            const shad.Gap(8),
            Text(
              l10n.timerRequestsStatusChangeGracePeriodHelp,
              style: theme.typography.textMuted,
            ),
            if (_error != null) ...[
              const shad.Gap(8),
              Text(
                _error!,
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.destructive,
                ),
              ),
            ],
          ],
        ),
      ),
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
                  child: shad.CircularProgressIndicator(),
                )
              : Text(l10n.timerSave),
        ),
      ],
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
