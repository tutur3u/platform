import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_description.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/widgets/apps_picker_editor.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/education/cubit/education_access_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// The current actionable Apps hub results, shared by display and submission.
List<AppModule> appsHubResults(
  BuildContext context,
  AppTabCubit cubit,
  String query,
) {
  final normalized = query.trim().toLowerCase();
  final matches = arrangeApps(AppRegistry.modules(context), cubit).where(
    (module) =>
        '${module.label(context.l10n)} '
                '${appDescription(context, module.id)} ${module.id}'
            .toLowerCase()
            .contains(normalized),
  );
  return {for (final module in matches) module.id: module}.values.toList();
}

/// Non-listening snapshot of every input used by registry discovery. Compare
/// immediately before launch: Bloc notifications may reach the widget after
/// another post-frame callback has already changed its current state.
Object appsHubAvailability(BuildContext context) => (
  context.read<ExperimentalAppsCubit?>()?.state,
  context.read<WorkspaceCubit?>()?.state,
  context.read<AuthCubit?>()?.state,
  context.read<InventoryAccessCubit?>()?.state,
  context.read<EducationAccessCubit?>()?.state,
  context.read<HabitsAccessCubit?>()?.state,
  Localizations.localeOf(context),
);
