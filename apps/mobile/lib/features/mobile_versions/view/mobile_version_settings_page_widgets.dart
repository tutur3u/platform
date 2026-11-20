part of 'mobile_version_settings_page.dart';

class _PolicyTextField extends StatelessWidget {
  const _PolicyTextField({
    required this.fieldKey,
    required this.label,
    required this.description,
    required this.controller,
    required this.placeholder,
    this.error,
    this.keyboardType,
  });

  final Key fieldKey;
  final String label;
  final String description;
  final TextEditingController controller;
  final String placeholder;
  final String? error;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) => SettingsFieldRow(
    child: AppTextField(
      key: fieldKey,
      controller: controller,
      label: label,
      placeholder: placeholder,
      helperText: description,
      errorText: error,
      keyboardType: keyboardType,
      style: const TextStyle(fontFamily: 'monospace'),
    ),
  );
}

class _PlatformPolicySection extends StatelessWidget {
  const _PlatformPolicySection({
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

  String _key(_PolicyField field) => '${platform.name}.${field.name}';

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isIos = platform == _MobilePlatform.ios;
    final compareError = validationErrors['${platform.name}.compare'];
    return SettingsCompactSection(
      title: isIos
          ? l10n.settingsMobileVersionsIosTitle
          : l10n.settingsMobileVersionsAndroidTitle,
      children: [
        SettingsSwitchRow(
          icon: LucideIcons.keyRound,
          title: l10n.settingsMobileVersionsOtpEnabled,
          subtitle: isIos
              ? l10n.settingsMobileVersionsIosOtpDescription
              : l10n.settingsMobileVersionsAndroidOtpDescription,
          value: otpEnabled,
          onChanged: onOtpEnabledChanged,
        ),
        _PolicyTextField(
          fieldKey: Key(_key(_PolicyField.effectiveVersion)),
          label: l10n.settingsMobileVersionsEffectiveVersion,
          description: l10n.settingsMobileVersionsEffectiveVersionDescription,
          controller: effectiveController,
          placeholder: l10n.settingsMobileVersionsVersionPlaceholder,
          error:
              validationErrors[_key(_PolicyField.effectiveVersion)] ??
              compareError,
        ),
        _PolicyTextField(
          fieldKey: Key(_key(_PolicyField.minimumVersion)),
          label: l10n.settingsMobileVersionsMinimumVersion,
          description: l10n.settingsMobileVersionsMinimumVersionDescription,
          controller: minimumController,
          placeholder: l10n.settingsMobileVersionsVersionPlaceholder,
          error: validationErrors[_key(_PolicyField.minimumVersion)],
        ),
        _PolicyTextField(
          fieldKey: Key(_key(_PolicyField.storeUrl)),
          label: l10n.settingsMobileVersionsStoreUrl,
          description: l10n.settingsMobileVersionsStoreUrlDescription,
          controller: storeUrlController,
          placeholder: l10n.settingsMobileVersionsStoreUrlPlaceholder,
          error: validationErrors[_key(_PolicyField.storeUrl)],
          keyboardType: TextInputType.url,
        ),
      ],
    );
  }
}
