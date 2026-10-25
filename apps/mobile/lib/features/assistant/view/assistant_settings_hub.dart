import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_settings_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/local/assistant_local_models_cubit.dart';
import 'package:mobile/features/assistant/local/widgets/assistant_local_models_section.dart';
import 'package:mobile/features/assistant/widgets/assistant_personal_settings_section.dart';
import 'package:mobile/features/assistant/widgets/assistant_settings_sheet_body.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Central Settings and Mira quick settings use the same preference editor.
class AssistantSettingsHub extends StatefulWidget {
  const AssistantSettingsHub({
    required this.workspaceId,
    required this.isScopeCurrent,
    this.preferences,
    this.localModels,
    super.key,
  });
  final String workspaceId;
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
  Widget build(BuildContext context) =>
      BlocBuilder<AssistantSettingsCubit, AssistantSettingsState>(
        bloc: _settings,
        builder: (context, state) => AppSheetScaffold(
          title: context.l10n.assistantSettingsTitle,
          padding: EdgeInsets.zero,
          slivers: [
            if (state.loading)
              SliverToBoxAdapter(
                child: Semantics(
                  label: context.l10n.commonLoading,
                  child: const SizedBox(
                    height: 160,
                    child: Center(child: NovaLoadingIndicator(size: 20)),
                  ),
                ),
              )
            else
              SliverList.list(
                children: [
                  if (state.loaded)
                    AssistantSettingsSheetBody(
                      keepLiveWhileBrowsing: state.keepLiveWhileBrowsing,
                      onKeepLiveWhileBrowsingChanged: _settings.save,
                      enabled: !state.saving,
                      showTitle: false,
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
          ],
        ),
      );
}
