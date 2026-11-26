import 'package:flutter/material.dart';
import 'package:mobile/data/models/task_progress.dart';
import 'package:mobile/l10n/l10n.dart';

Future<bool> showTasksProgressQuickLog(
  BuildContext context, {
  required List<ProgressMetric> metrics,
  required Future<void> Function(ProgressMetric, num, String?) save,
}) async =>
    await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _QuickLog(metrics: metrics, save: save),
    ) ??
    false;

class _QuickLog extends StatefulWidget {
  const _QuickLog({required this.metrics, required this.save});

  final List<ProgressMetric> metrics;
  final Future<void> Function(ProgressMetric, num, String?) save;

  @override
  State<_QuickLog> createState() => _QuickLogState();
}

class _QuickLogState extends State<_QuickLog> {
  final _form = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _note = TextEditingController();
  late ProgressMetric _metric = widget.metrics.first;
  bool _saving = false;
  bool _failed = false;

  num? get _value => num.tryParse(_amount.text.trim().replaceAll(',', '.'));

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || _failed || !_form.currentState!.validate()) return;
    setState(() => _saving = true);
    final note = _note.text.trim();
    try {
      await widget.save(_metric, _value!, note.isEmpty ? null : note);
      if (mounted) Navigator.of(context).pop(true);
    } on Object {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return PopScope(
      canPop: !_saving,
      child: AlertDialog(
        title: Text(l10n.tasksProgressQuickLog),
        content: Form(
          key: _form,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                DropdownButtonFormField<ProgressMetric>(
                  initialValue: _metric,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: l10n.tasksProgressMetric,
                  ),
                  items: [
                    for (final metric in widget.metrics)
                      DropdownMenuItem(
                        value: metric,
                        child: Text(
                          metric.name,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                  onChanged: _saving || _failed
                      ? null
                      : (metric) {
                          if (metric != null) setState(() => _metric = metric);
                        },
                ),
                TextFormField(
                  controller: _amount,
                  enabled: !_saving && !_failed,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                    signed: true,
                  ),
                  decoration: InputDecoration(
                    labelText: l10n.tasksProgressAmount,
                    hintText: l10n.tasksProgressAmountHint,
                    suffixText: _metric.unit,
                  ),
                  validator: (_) {
                    final magnitude = _value?.abs();
                    return magnitude != null &&
                            magnitude >= 0.01 &&
                            magnitude <= 999999999999.99
                        ? null
                        : l10n.tasksProgressInvalidAmount;
                  },
                ),
                TextFormField(
                  controller: _note,
                  enabled: !_saving && !_failed,
                  maxLength: 2000,
                  decoration: InputDecoration(
                    labelText: l10n.tasksProgressNote,
                    hintText: l10n.tasksProgressNoteHint,
                  ),
                ),
                if (_failed)
                  Text(
                    l10n.tasksProgressSaveFailed,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: _saving ? null : () => Navigator.of(context).pop(),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: _saving || _failed ? null : _save,
            child: Text(l10n.commonSave),
          ),
        ],
      ),
    );
  }
}
