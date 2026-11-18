import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/l10n/l10n.dart';

// Product entries and general preferences share the same scoped editors.
Future<void> openFinanceProductSettings(
  BuildContext context,
  FinancePreferencesCubit cubit,
) async {
  final l10n = context.l10n;
  final selected = await showSettingsChoiceDialog<bool>(
    context: context,
    title: l10n.settingsFinanceAmounts,
    description: l10n.settingsFinanceAmountsDescription,
    currentValue: cubit.state.showAmounts,
    options: [
      SettingsChoiceOption(
        value: true,
        label: l10n.financeShowAmounts,
        icon: Icons.visibility_outlined,
      ),
      SettingsChoiceOption(
        value: false,
        label: l10n.financeHideAmounts,
        icon: Icons.visibility_off_outlined,
      ),
    ],
  );
  if (selected != null &&
      context.mounted &&
      selected != cubit.state.showAmounts) {
    await cubit.setShowAmounts(value: selected);
  }
}

Future<void> openCalendarProductSettings(BuildContext context) async {
  final l10n = context.l10n;
  final cubit = context.read<CalendarSettingsCubit>();
  final selected = await showSettingsChoiceDialog<FirstDayOfWeek>(
    context: context,
    title: l10n.settingsFirstDayOfWeek,
    description: l10n.settingsFirstDayOfWeekDescription,
    currentValue: cubit.state.userPreference,
    options: [
      SettingsChoiceOption(
        value: FirstDayOfWeek.auto_,
        label: l10n.settingsFirstDayAuto,
        icon: Icons.auto_mode_rounded,
        description: l10n.settingsFirstDayAutoDescription,
      ),
      SettingsChoiceOption(
        value: FirstDayOfWeek.monday,
        label: l10n.settingsFirstDayMonday,
        icon: Icons.calendar_view_week_rounded,
      ),
      SettingsChoiceOption(
        value: FirstDayOfWeek.sunday,
        label: l10n.settingsFirstDaySunday,
        icon: Icons.view_week_rounded,
      ),
      SettingsChoiceOption(
        value: FirstDayOfWeek.saturday,
        label: l10n.settingsFirstDaySaturday,
        icon: Icons.event_repeat_rounded,
      ),
    ],
  );

  if (selected != null && context.mounted) {
    await cubit.setFirstDayOfWeek(selected);
  }
}
