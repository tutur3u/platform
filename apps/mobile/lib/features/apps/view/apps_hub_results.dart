import 'package:flutter/widgets.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_description.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/widgets/apps_picker_editor.dart';
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
