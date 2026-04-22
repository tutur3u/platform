part of 'mobile_version_settings_page.dart';

class _FieldBlock extends StatelessWidget {
  const _FieldBlock({
    required this.label,
    required this.description,
    required this.controller,
    required this.hintText,
    this.error,
    this.keyboardType,
    this.fieldKey,
  });

  final String label;
  final String description;
  final TextEditingController controller;
  final String hintText;
  final String? error;
  final TextInputType? keyboardType;
  final Key? fieldKey;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: theme.typography.small),
        const shad.Gap(6),
        shad.TextField(
          contextMenuBuilder: platformTextContextMenuBuilder(),
          key: fieldKey,
          controller: controller,
          keyboardType: keyboardType,
          hintText: hintText,
        ),
        const shad.Gap(6),
        Text(description, style: theme.typography.textMuted),
        if (error != null) ...[
          const shad.Gap(6),
          Text(
            error!,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.destructive,
            ),
          ),
        ],
      ],
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({
    required this.title,
    required this.description,
  });

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return SettingsPanel(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(
              Icons.system_update_alt_rounded,
              color: theme.colorScheme.primary,
            ),
          ),
          const shad.Gap(14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const shad.Gap(6),
                Text(
                  description,
                  style: theme.typography.textSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MessagePanel extends StatelessWidget {
  const _MessagePanel({
    required this.icon,
    required this.title,
    required this.description,
    this.action,
  });

  final IconData icon;
  final String title;
  final String description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return SettingsPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: theme.colorScheme.mutedForeground, size: 22),
          const shad.Gap(12),
          Text(
            title,
            style: theme.typography.large.copyWith(fontWeight: FontWeight.w800),
          ),
          const shad.Gap(6),
          Text(
            description,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          if (action != null) ...[
            const shad.Gap(16),
            action!,
          ],
        ],
      ),
    );
  }
}

class _PlatformPoliciesGrid extends StatelessWidget {
  const _PlatformPoliciesGrid({
    required this.iosCard,
    required this.androidCard,
    this.webCard,
  });

  final Widget iosCard;
  final Widget androidCard;
  final Widget? webCard;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final useTwoColumns = constraints.maxWidth >= 840;
        if (!useTwoColumns) {
          return Column(
            children: [
              iosCard,
              const shad.Gap(16),
              androidCard,
              if (webCard != null) ...[
                const shad.Gap(16),
                webCard!,
              ],
            ],
          );
        }

        return Column(
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: iosCard),
                const shad.Gap(16),
                Expanded(child: androidCard),
              ],
            ),
            if (webCard != null) ...[
              const shad.Gap(16),
              webCard!,
            ],
          ],
        );
      },
    );
  }
}

class _PlatformPolicyCard extends StatelessWidget {
  const _PlatformPolicyCard({
    required this.platform,
    required this.effectiveController,
    required this.minimumController,
    required this.otpEnabled,
    required this.onOtpEnabledChanged,
    required this.storeUrlController,
    required this.validationErrors,
  });

  final _MobilePlatform platform;
  final TextEditingController effectiveController;
  final TextEditingController minimumController;
  final bool otpEnabled;
  final ValueChanged<bool> onOtpEnabledChanged;
  final TextEditingController storeUrlController;
  final Map<String, String> validationErrors;

  String _fieldKey(_PolicyField field) => '${platform.name}.${field.name}';

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final isIos = platform == _MobilePlatform.ios;

    return SettingsPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            isIos
                ? l10n.settingsMobileVersionsIosTitle
                : l10n.settingsMobileVersionsAndroidTitle,
            style: theme.typography.large.copyWith(fontWeight: FontWeight.w800),
          ),
          const shad.Gap(6),
          Text(
            isIos
                ? l10n.settingsMobileVersionsIosDescription
                : l10n.settingsMobileVersionsAndroidDescription,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(18),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              border: Border.all(color: theme.colorScheme.border),
              borderRadius: BorderRadius.circular(18),
              color: theme.colorScheme.muted.withValues(alpha: 0.18),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.settingsMobileVersionsOtpEnabled,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const shad.Gap(4),
                      Text(
                        isIos
                            ? l10n.settingsMobileVersionsIosOtpDescription
                            : l10n.settingsMobileVersionsAndroidOtpDescription,
                        style: theme.typography.textSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
                const shad.Gap(12),
                shad.Switch(
                  value: otpEnabled,
                  onChanged: onOtpEnabledChanged,
                ),
              ],
            ),
          ),
          const shad.Gap(16),
          _FieldBlock(
            label: l10n.settingsMobileVersionsEffectiveVersion,
            description: l10n.settingsMobileVersionsEffectiveVersionDescription,
            controller: effectiveController,
            hintText: l10n.settingsMobileVersionsVersionPlaceholder,
            error: validationErrors[_fieldKey(_PolicyField.effectiveVersion)],
            keyboardType: TextInputType.text,
            fieldKey: Key(_fieldKey(_PolicyField.effectiveVersion)),
          ),
          if (validationErrors['${platform.name}.compare'] != null) ...[
            const shad.Gap(6),
            Text(
              validationErrors['${platform.name}.compare']!,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.destructive,
              ),
            ),
          ],
          const shad.Gap(16),
          _FieldBlock(
            label: l10n.settingsMobileVersionsMinimumVersion,
            description: l10n.settingsMobileVersionsMinimumVersionDescription,
            controller: minimumController,
            hintText: l10n.settingsMobileVersionsVersionPlaceholder,
            error: validationErrors[_fieldKey(_PolicyField.minimumVersion)],
            keyboardType: TextInputType.text,
            fieldKey: Key(_fieldKey(_PolicyField.minimumVersion)),
          ),
          const shad.Gap(16),
          _FieldBlock(
            label: l10n.settingsMobileVersionsStoreUrl,
            description: l10n.settingsMobileVersionsStoreUrlDescription,
            controller: storeUrlController,
            hintText: l10n.settingsMobileVersionsStoreUrlPlaceholder,
            error: validationErrors[_fieldKey(_PolicyField.storeUrl)],
            keyboardType: TextInputType.url,
            fieldKey: Key(_fieldKey(_PolicyField.storeUrl)),
          ),
        ],
      ),
    );
  }
}

class _WebOtpCard extends StatelessWidget {
  const _WebOtpCard({
    required this.enabled,
    required this.onChanged,
  });

  final bool enabled;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return SettingsPanel(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.settingsMobileVersionsWebOtpTitle,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const shad.Gap(6),
                Text(
                  l10n.settingsMobileVersionsWebOtpDescription,
                  style: theme.typography.textSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          const shad.Gap(16),
          shad.Switch(
            value: enabled,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}
