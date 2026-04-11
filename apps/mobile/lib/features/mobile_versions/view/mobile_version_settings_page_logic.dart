part of 'mobile_version_settings_page.dart';

extension _MobileVersionSettingsPageLogic on _MobileVersionSettingsPageState {
  bool get _isDirty => _currentPolicies().normalized() != _initialPolicies;

  bool get _isInRootWorkspace {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    return workspace != null && isSystemWorkspace(workspace);
  }

  void _applyPolicies(MobileVersionPolicies policies) {
    final normalized = policies.normalized();
    _isApplyingPolicies = true;
    _initialPolicies = normalized;
    _iosEffectiveController.text = normalized.ios.effectiveVersion ?? '';
    _iosMinimumController.text = normalized.ios.minimumVersion ?? '';
    _iosOtpEnabled = normalized.ios.otpEnabled;
    _iosStoreUrlController.text = normalized.ios.storeUrl ?? '';
    _androidEffectiveController.text =
        normalized.android.effectiveVersion ?? '';
    _androidMinimumController.text = normalized.android.minimumVersion ?? '';
    _androidOtpEnabled = normalized.android.otpEnabled;
    _androidStoreUrlController.text = normalized.android.storeUrl ?? '';
    _webOtpEnabled = normalized.webOtpEnabled;
    _isApplyingPolicies = false;
  }

  String _compareValidationKey(_MobilePlatform platform) {
    return '${platform.name}.compare';
  }

  MobileVersionPolicies _currentPolicies() {
    return MobileVersionPolicies(
      ios: MobilePlatformVersionPolicy(
        effectiveVersion: _normalizeOptionalString(
          _iosEffectiveController.text,
        ),
        minimumVersion: _normalizeOptionalString(_iosMinimumController.text),
        otpEnabled: _iosOtpEnabled,
        storeUrl: _normalizeOptionalString(_iosStoreUrlController.text),
      ),
      android: MobilePlatformVersionPolicy(
        effectiveVersion: _normalizeOptionalString(
          _androidEffectiveController.text,
        ),
        minimumVersion: _normalizeOptionalString(
          _androidMinimumController.text,
        ),
        otpEnabled: _androidOtpEnabled,
        storeUrl: _normalizeOptionalString(_androidStoreUrlController.text),
      ),
      webOtpEnabled: _webOtpEnabled,
    ).normalized();
  }

  String _fieldKey(_MobilePlatform platform, _PolicyField field) {
    return '${platform.name}.${field.name}';
  }

  int _compareStrictSemver(String left, String right) {
    List<int> parse(String value) {
      return value.split('.').map(int.parse).toList(growable: false);
    }

    final leftParts = parse(left);
    final rightParts = parse(right);

    for (var index = 0; index < 3; index++) {
      final difference = leftParts[index] - rightParts[index];
      if (difference != 0) {
        return difference;
      }
    }

    return 0;
  }

  void _handleFormChanged() {
    if (!mounted || _isApplyingPolicies) {
      return;
    }

    _updateState(() {
      if (_validationErrors.isNotEmpty) {
        _validationErrors = const <String, String>{};
      }
    });
  }

  Future<void> _loadScreenState() async {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    final loadToken = ++_loadToken;

    _updateState(() {
      _isLoading = true;
      _error = null;
      _hasAccess = false;
      _validationErrors = const <String, String>{};
    });

    if (workspace == null || !isSystemWorkspace(workspace)) {
      if (!mounted || loadToken != _loadToken) {
        return;
      }

      _updateState(() => _isLoading = false);
      return;
    }

    try {
      final permissions = await _permissionsRepository.getPermissions(
        wsId: rootWorkspaceId,
      );

      if (!mounted || loadToken != _loadToken) {
        return;
      }

      final hasAccess = permissions.containsPermission(
        manageWorkspaceRolesPermission,
      );
      if (!hasAccess) {
        _updateState(() {
          _hasAccess = false;
          _isLoading = false;
        });
        return;
      }

      final policies = await _policyRepository.getPolicies();

      if (!mounted || loadToken != _loadToken) {
        return;
      }

      _updateState(() {
        _hasAccess = true;
        _isLoading = false;
        _error = null;
        _applyPolicies(policies);
      });
    } on Exception catch (error) {
      if (!mounted || loadToken != _loadToken) {
        return;
      }

      final message = error.toString().trim();
      _updateState(() {
        _isLoading = false;
        _error = message.isNotEmpty
            ? message
            : context.l10n.settingsMobileVersionsLoadError;
      });
    }
  }

  String? _normalizeOptionalString(String? value) {
    final trimmed = value?.trim() ?? '';
    return trimmed.isEmpty ? null : trimmed;
  }

  Future<void> _onRefresh() async {
    await _loadScreenState();
  }

  Future<void> _savePolicies() async {
    final validationErrors = _validatePolicies();
    if (validationErrors.isNotEmpty) {
      _updateState(() => _validationErrors = validationErrors);
      return;
    }

    _updateState(() {
      _isSaving = true;
      _validationErrors = const <String, String>{};
    });

    try {
      final updatedPolicies = await _policyRepository.updatePolicies(
        _currentPolicies(),
      );
      if (!mounted) {
        return;
      }

      _updateState(() {
        _isSaving = false;
        _applyPolicies(updatedPolicies);
      });
      _showToast(
        message: context.l10n.settingsMobileVersionsSaveSuccess,
      );
    } on Exception catch (error) {
      if (!mounted) {
        return;
      }

      _updateState(() => _isSaving = false);
      final message = error.toString().trim();
      _showToast(
        message: message.isNotEmpty
            ? message
            : context.l10n.settingsMobileVersionsSaveError,
        destructive: true,
      );
    }
  }

  void _showToast({required String message, bool destructive = false}) {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) {
      return;
    }

    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => destructive
          ? shad.Alert.destructive(content: Text(message))
          : shad.Alert(content: Text(message)),
    );
  }

  Map<String, String> _validatePolicies() {
    final policies = _currentPolicies();
    final l10n = context.l10n;
    final semverPattern = RegExp(_strictSemverPattern);
    final errors = <String, String>{};

    void validatePlatform(
      _MobilePlatform platform,
      MobilePlatformVersionPolicy policy,
    ) {
      final hasThreshold =
          policy.effectiveVersion != null || policy.minimumVersion != null;

      if (policy.effectiveVersion != null &&
          !semverPattern.hasMatch(policy.effectiveVersion!)) {
        errors[_fieldKey(platform, _PolicyField.effectiveVersion)] =
            l10n.settingsMobileVersionsValidationVersionFormat;
      }

      if (policy.minimumVersion != null &&
          !semverPattern.hasMatch(policy.minimumVersion!)) {
        errors[_fieldKey(platform, _PolicyField.minimumVersion)] =
            l10n.settingsMobileVersionsValidationVersionFormat;
      }

      if (hasThreshold && policy.storeUrl == null) {
        errors[_fieldKey(platform, _PolicyField.storeUrl)] =
            l10n.settingsMobileVersionsValidationStoreUrlRequired;
      }

      if (policy.effectiveVersion != null &&
          policy.minimumVersion != null &&
          semverPattern.hasMatch(policy.effectiveVersion!) &&
          semverPattern.hasMatch(policy.minimumVersion!) &&
          _compareStrictSemver(
                policy.effectiveVersion!,
                policy.minimumVersion!,
              ) <
              0) {
        errors[_compareValidationKey(platform)] =
            l10n.settingsMobileVersionsValidationEffectiveAtLeastMinimum;
      }
    }

    validatePlatform(_MobilePlatform.ios, policies.ios);
    validatePlatform(_MobilePlatform.android, policies.android);

    return errors;
  }
}
