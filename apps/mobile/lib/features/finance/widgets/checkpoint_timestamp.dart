import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Composes the shared date and time pickers for checkpoint forms.
class CheckpointTimestamp extends StatelessWidget {
  const CheckpointTimestamp({
    required this.value,
    required this.onChanged,
    super.key,
  });

  final DateTime value;
  final ValueChanged<DateTime> onChanged;

  @override
  Widget build(BuildContext context) {
    final local = value.toLocal();
    final time = TimeOfDay.fromDateTime(local);
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text(
          context.l10n.financeCheckpointsCheckedAt,
          style: context.tokens.typography.small,
        ),
        AppButton.secondary(
          leading: const Icon(LucideIcons.calendar),
          onPressed: () async {
            final picked = await showAppDatePicker(
              context: context,
              initialDate: local,
              firstDate: DateTime(1900),
              lastDate: DateTime(2100),
            );
            if (picked == null || !context.mounted) return;
            onChanged(
              DateTime(
                picked.year,
                picked.month,
                picked.day,
                time.hour,
                time.minute,
              ),
            );
          },
          child: Text(
            MaterialLocalizations.of(context).formatMediumDate(local),
          ),
        ),
        AppButton.secondary(
          leading: const Icon(LucideIcons.clock),
          onPressed: () async {
            final picked = await showAppTimePicker(
              context: context,
              initialTime: time,
            );
            if (picked == null || !context.mounted) return;
            onChanged(
              DateTime(
                local.year,
                local.month,
                local.day,
                picked.hour,
                picked.minute,
              ),
            );
          },
          child: Text(time.format(context)),
        ),
      ],
    );
  }
}
