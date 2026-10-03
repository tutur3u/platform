import 'package:flutter/material.dart';
import 'package:mobile/data/models/google_calendar_color.dart';
import 'package:mobile/l10n/l10n.dart';

class GoogleCalendarColorPicker extends StatelessWidget {
  const GoogleCalendarColorPicker({
    required this.colors,
    required this.onChanged,
    this.selected,
    super.key,
  });
  final GoogleCalendarColorOptions colors;
  final GoogleCalendarColorChoice? selected;
  final ValueChanged<GoogleCalendarColorChoice> onChanged;

  @override
  Widget build(BuildContext context) {
    if (!colors.writesEnabled) return const SizedBox.shrink();
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final option in colors.options)
          ChoiceChip(
            key: ValueKey(
              'google-color-${option.kind}-${option.id ?? "inherit"}',
            ),
            avatar: CircleAvatar(
              backgroundColor: Color(
                int.parse(option.background.substring(1), radix: 16) |
                    0xff000000,
              ),
            ),
            label: Text(
              option.kind == 'inherit'
                  ? context.l10n.calendarGoogleColorInherit
                  : option.name ??
                        (option.kind == 'label'
                            ? context.l10n.calendarGoogleColorLabel(
                                option.id ?? '',
                              )
                            : context.l10n.calendarGoogleColorEvent(
                                option.id ?? '',
                              )),
            ),
            selected:
                selected?.kind == option.kind && selected?.id == option.id,
            onSelected: (_) => onChanged(option.choice(colors.connectionId)),
          ),
      ],
    );
  }
}
