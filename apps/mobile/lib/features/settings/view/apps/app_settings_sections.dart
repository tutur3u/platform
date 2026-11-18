import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/view/apps/app_settings_group.dart';
import 'package:mobile/features/settings/view/apps/app_settings_labels.dart';
import 'package:mobile/features/settings/view/product_preference_editors.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

export 'package:mobile/features/settings/view/apps/calendar_app_settings.dart';

/// Finance: amount visibility, shared with the eye action on finance pages.
class FinanceAppSettings extends StatelessWidget {
  const FinanceAppSettings({super.key});

  @override
  Widget build(BuildContext context) {
    final cubit = context.watch<FinancePreferencesCubit?>();
    if (cubit == null) return const SizedBox.shrink();
    final l10n = context.l10n;
    return AppSettingsGroup(
      title: l10n.settingsAppPrivacyGroup,
      footer: l10n.settingsFooterDevice,
      children: [
        SettingsTile(
          key: const ValueKey('settings-finance-row'),
          grouped: true,
          icon: LucideIcons.eye,
          title: l10n.settingsFinanceAmounts,
          value: financeAmountsLabel(
            l10n,
            showAmounts: cubit.state.showAmounts,
          ),
          onTap: () => unawaited(openFinanceProductSettings(context, cubit)),
        ),
      ],
    );
  }
}
