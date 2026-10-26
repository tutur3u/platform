import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_state.dart';
import 'package:mobile/features/settings/view/appearance/appearance_accent_picker.dart';
import 'package:mobile/features/settings/view/appearance/appearance_controls.dart';
import 'package:mobile/features/settings/view/appearance/appearance_labels.dart';
import 'package:mobile/features/settings/view/appearance/appearance_pickers.dart';
import 'package:mobile/features/settings/view/appearance/appearance_preview.dart';
import 'package:mobile/features/settings/view/appearance/appearance_theme_gallery.dart';
import 'package:mobile/features/settings/view/settings_profile_parts.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

/// Settings → Appearance: mode, curated themes, accent, background style and
/// surface tuning. Every choice applies instantly and persists.
class AppearancePage extends StatefulWidget {
  const AppearancePage({this.highlight, super.key});

  /// Theme to feature with a "New" chip, from `?highlight=` on first visit.
  final AppearanceThemeId? highlight;

  @override
  State<AppearancePage> createState() => _AppearancePageState();
}

class _AppearancePageState extends State<AppearancePage> {
  @override
  void initState() {
    super.initState();
    // Any visit, including a deep link, retires the Settings "New" chip.
    unawaited(SettingsRepository().setAppearanceIntroSeen());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final cubit = context.read<ThemeCubit>();
    final state = context.watch<ThemeCubit>().state;
    final settings = state.appearance;
    final brightness = AppTokens.of(context).brightness;
    final horizontal = ResponsivePadding.horizontal(context.deviceClass);

    void choose(Future<void> Function() apply) {
      unawaited(AppHaptics.selection());
      unawaited(apply());
    }

    Widget section(String caption, Widget child, {String? trailing}) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: SettingsCaption(caption)),
            // Tight fit so the value sits flush right, not after the caption.
            if (trailing != null)
              Expanded(
                child: SettingsCaption(trailing, textAlign: TextAlign.end),
              ),
          ],
        ),
        const AppGap(8),
        child,
        const AppGap(SettingsRowLayout.groupGap),
      ],
    );

    return AppScaffold(
      child: ResponsiveWrapper(
        maxWidth: ResponsivePadding.rootContentWidth(context.deviceClass),
        child: ListView(
          key: const ValueKey('appearance-page'),
          padding: SettingsRowLayout.scrollPadding(context, horizontal),
          children: [
            section(
              l10n.appearancePreviewTitle,
              AppearancePreview(settings: settings),
            ),
            section(
              l10n.appearanceModeTitle,
              AppearanceSegmented<ThemeMode>(
                key: const ValueKey('appearance-mode'),
                values: ThemeMode.values,
                selected: ThemeMode.values.byName(state.themeMode.name),
                label: l10n.appearanceMode,
                icon: (mode) => switch (mode) {
                  ThemeMode.system => LucideIcons.sunMoon,
                  ThemeMode.light => LucideIcons.sun,
                  ThemeMode.dark => LucideIcons.moon,
                },
                onSelected: (mode) => choose(
                  () =>
                      cubit.setThemeMode(ThemeCubit.parseThemeMode(mode.name)),
                ),
              ),
            ),
            section(
              l10n.appearanceThemesTitle,
              AppearanceThemeGallery(
                settings: settings,
                brightness: brightness,
                highlight: widget.highlight,
                onSelected: (id) => choose(() => cubit.selectTheme(id)),
              ),
            ),
            section(
              l10n.appearanceAccentTitle,
              trailing: l10n.appearanceAccent(
                AppearancePalettes.effectiveAccentId(settings),
              ),
              AppearanceAccentPicker(
                settings: settings,
                brightness: brightness,
                onSelected: (id) => choose(
                  () => cubit.setAppearance(settings.copyWith(accent: id)),
                ),
              ),
            ),
            section(
              l10n.appearanceBackgroundTitle,
              AppearanceSegmented<AppearanceBackgroundStyle>(
                key: const ValueKey('appearance-background'),
                values: AppearanceBackgroundStyle.values,
                selected: settings.backgroundStyle,
                label: l10n.appearanceBackground,
                icon: (style) => switch (style) {
                  AppearanceBackgroundStyle.solid => LucideIcons.square,
                  AppearanceBackgroundStyle.gradient => LucideIcons.rainbow,
                  AppearanceBackgroundStyle.blobs => LucideIcons.blend,
                },
                onSelected: (style) => choose(
                  () => cubit.setAppearance(
                    settings.copyWith(backgroundStyle: style),
                  ),
                ),
              ),
            ),
            if (settings.hasAmbientBackground)
              section(
                l10n.appearanceSurfacesTitle,
                AppearanceAdjustments(
                  settings: settings,
                  onPreview: cubit.previewAppearance,
                  onCommit: (next) => unawaited(cubit.setAppearance(next)),
                ),
              ),
            _ResetButton(state: state, cubit: cubit),
          ],
        ),
      ),
    );
  }
}

class _ResetButton extends StatelessWidget {
  const _ResetButton({required this.state, required this.cubit});

  final ThemeState state;
  final ThemeCubit cubit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isDefault =
        state.appearance.isDefault &&
        state.themeMode.name == ThemeMode.system.name;
    return Opacity(
      opacity: isDefault ? 0.5 : 1,
      child: SettingsPillButton(
        key: const ValueKey('appearance-reset'),
        label: l10n.appearanceReset,
        onPressed: isDefault
            ? null
            : () async {
                unawaited(AppHaptics.success());
                await cubit.resetAppearance();
                if (!context.mounted) return;
                showAppToast(context, message: l10n.appearanceResetDone);
              },
      ),
    );
  }
}
