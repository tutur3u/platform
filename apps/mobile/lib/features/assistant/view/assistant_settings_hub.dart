import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_settings_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/local/assistant_local_models_cubit.dart';
import 'package:mobile/features/assistant/local/widgets/assistant_local_models_section.dart';
import 'package:mobile/features/assistant/view/assistant_settings_route_frame.dart';
import 'package:mobile/features/assistant/widgets/assistant_personal_settings_section.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_browsing_setting.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Central Settings and Mira quick settings use the same preference editor.
class AssistantSettingsHub extends StatefulWidget {
  const AssistantSettingsHub({
    required this.workspaceId,
    required this.isScopeCurrent,
    this.locations,
    this.preferences,
    this.localModels,
    super.key,
  });
  final String workspaceId;
  final Set<String>? locations;
  final bool Function() isScopeCurrent;
  final AssistantPreferences? preferences;
  final AssistantLocalModelsCubit? localModels;
  @override
  State<AssistantSettingsHub> createState() => _AssistantSettingsHubState();
}

class _AssistantSettingsHubState extends State<AssistantSettingsHub> {
  late final _settings = AssistantSettingsCubit(
    workspaceId: widget.workspaceId,
    isScopeCurrent: widget.isScopeCurrent,
    preferences: widget.preferences,
  );
  @override
  void initState() {
    super.initState();
    unawaited(_settings.load());
  }

  @override
  void dispose() {
    unawaited(_settings.close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AssistantSettingsRouteFrame(
    title: context.l10n.assistantSettingsTitle,
    locations: widget.locations,
    child: BlocBuilder<AssistantSettingsCubit, AssistantSettingsState>(
      bloc: _settings,
      builder: (context, state) => state.loading
          ? Semantics(
              label: context.l10n.commonLoading,
              child: const Center(child: NovaLoadingIndicator(size: 20)),
            )
          : AppPageListView(
              children: [
                if (state.loaded)
                  AssistantLiveBrowsingSetting(
                    keepLiveWhileBrowsing: state.keepLiveWhileBrowsing,
                    onKeepLiveWhileBrowsingChanged: _settings.save,
                    enabled: !state.saving,
                  ),
                if (state.failed)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Column(
                      children: [
                        Text(
                          state.loaded
                              ? context.l10n.assistantLiveSettingSaveError
                              : context.l10n.commonSomethingWentWrong,
                        ),
                        AppButton.ghost(
                          onPressed: () => unawaited(_settings.load()),
                          child: Text(context.l10n.commonRetry),
                        ),
                      ],
                    ),
                  ),
                AssistantPersonalSettingsSection(
                  key: ValueKey('personal-settings-${widget.workspaceId}'),
                  workspaceId: widget.workspaceId,
                  isScopeCurrent: widget.isScopeCurrent,
                ),
                AssistantLocalModelsSection(
                  key: ValueKey(widget.workspaceId),
                  cubit: widget.localModels,
                  workspaceId: widget.workspaceId,
                  isScopeCurrent: widget.isScopeCurrent,
                ),
              ],
            ),
    ),
  );
}
