import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';

/// Only registered assistant title/recovery controls need the larger target.
/// The caller provides its route so cached pages cannot resize another header.
double assistantHeaderContentHeight(
  BuildContext context, {
  required String location,
}) {
  if (location != Routes.assistant) return mobileSectionAppBarHeight;
  final live =
      context.watch<AssistantChromeCubit?>()?.state.isLiveMode ?? false;
  final registration = context
      .watch<ShellTitleOverrideCubit?>()
      ?.state
      .registrationForLocation(location);
  return (registration?.canEditTitle ?? false) ||
          (!live && registration?.subtitle != null)
      ? 48
      : mobileSectionAppBarHeight;
}
