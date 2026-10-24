import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/components/app_list_tile.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_controller.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_editor.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:mobile/l10n/l10n.dart';

/// Open with showAppSheet. Changes apply immediately; the caller owns lifetime.
class AssistantThemeSheet extends StatelessWidget {
  const AssistantThemeSheet({
    required AssistantThemePreferences value,
    required ValueChanged<AssistantThemePreferences>? onChanged,
    super.key,
  }) : _value = value,
       _onChanged = onChanged,
       _controller = null;

  const AssistantThemeSheet.controlled({
    required AssistantThemeController controller,
    super.key,
  }) : _controller = controller,
       _value = null,
       _onChanged = null;

  final AssistantThemePreferences? _value;
  final ValueChanged<AssistantThemePreferences>? _onChanged;
  final AssistantThemeController? _controller;

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) return _content(context, _value!, _onChanged);
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) => _content(
        context,
        controller.value,
        controller.onChanged,
        controller: controller,
      ),
    );
  }

  Widget _content(
    BuildContext context,
    AssistantThemePreferences value,
    ValueChanged<AssistantThemePreferences>? onChanged, {
    AssistantThemeController? controller,
  }) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.assistantThemeTitle,
      description: l10n.assistantThemeDeviceScope,
      actions: [
        AppButton.ghost(
          onPressed: onChanged == null
              ? null
              : () => onChanged(const AssistantThemePreferences()),
          child: Text(l10n.assistantThemeReset),
        ),
      ],
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (controller?.loading ?? false)
            AppListTile(title: Text(l10n.assistantThemeLoading)),
          if (controller?.saving ?? false)
            Semantics(
              liveRegion: true,
              label: l10n.assistantThemeSaving,
              child: const SizedBox.shrink(),
            ),
          if (controller?.storageFailed ?? false)
            Semantics(
              liveRegion: true,
              child: AppListTile(
                title: Text(l10n.assistantThemeStorageError),
                trailing: AppButton.outline(
                  onPressed: () => unawaited(controller!.retry()),
                  child: Text(l10n.assistantThemeRetry),
                ),
              ),
            ),
          AssistantThemeEditor(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}
