import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_loading_indicator.dart';
import 'package:mobile/data/models/mobile_version_policy.dart';
import 'package:mobile/data/repositories/mobile_version_policy_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
part 'mobile_version_settings_page_logic.dart';
part 'mobile_version_settings_page_widgets.dart';

const _strictSemverPattern = r'^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$';

enum _MobilePlatform { ios, android }

enum _PolicyField { effectiveVersion, minimumVersion, storeUrl }

class MobileVersionSettingsPage extends StatefulWidget {
  const MobileVersionSettingsPage({
    super.key,
    this.policyRepository,
    this.permissionsRepository,
  });

  final MobileVersionPolicyRepository? policyRepository;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  State<MobileVersionSettingsPage> createState() =>
      _MobileVersionSettingsPageState();
}

class _MobileVersionSettingsPageState extends State<MobileVersionSettingsPage> {
  final _iosEffectiveController = TextEditingController();
  final _iosMinimumController = TextEditingController();
  final _iosStoreUrlController = TextEditingController();
  final _androidEffectiveController = TextEditingController();
  final _androidMinimumController = TextEditingController();
  final _androidStoreUrlController = TextEditingController();
  bool _androidOtpEnabled = false;
  bool _iosOtpEnabled = false;
  bool _webOtpEnabled = false;

  late final MobileVersionPolicyRepository _policyRepository;
  late final WorkspacePermissionsRepository _permissionsRepository;

  MobileVersionPolicies _initialPolicies = MobileVersionPolicies.empty();
  Map<String, String> _validationErrors = const <String, String>{};
  bool _hasAccess = false;
  bool _isApplyingPolicies = false;
  bool _isLoading = true;
  bool _isSaving = false;
  String? _error;
  int _loadToken = 0;

  void _updateState(VoidCallback callback) {
    setState(callback);
  }

  @override
  void initState() {
    super.initState();
    _policyRepository =
        widget.policyRepository ?? MobileVersionPolicyRepository();
    _permissionsRepository =
        widget.permissionsRepository ?? WorkspacePermissionsRepository();

    for (final controller in _allControllers) {
      controller.addListener(_handleFormChanged);
    }

    unawaited(_loadScreenState());
  }

  Iterable<TextEditingController> get _allControllers => [
    _iosEffectiveController,
    _iosMinimumController,
    _iosStoreUrlController,
    _androidEffectiveController,
    _androidMinimumController,
    _androidStoreUrlController,
  ];

  @override
  void dispose() {
    for (final controller in _allControllers) {
      controller
        ..removeListener(_handleFormChanged)
        ..dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => unawaited(_loadScreenState()),
        child: NovaRefreshIndicator(
          onRefresh: _onRefresh,
          // Root width so the platform policy cards can use two columns.
          child: AppPageListView(
            kind: AppPageKind.root,
            physics: const AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),
            children: [
              _HeroCard(
                title: l10n.settingsMobileVersionsTitle,
                description: l10n.settingsMobileVersionsPageDescription,
              ),
              const shad.Gap(AppLayout.sectionGap),
              if (_isLoading)
                const Padding(
                  padding: EdgeInsets.only(top: 36),
                  child: AppLoadingIndicator.page(),
                )
              else if (_error != null)
                _MessagePanel(
                  icon: Icons.error_outline_rounded,
                  title: l10n.commonSomethingWentWrong,
                  description: _error!,
                  action: shad.PrimaryButton(
                    onPressed: () => unawaited(_loadScreenState()),
                    child: Text(l10n.commonRetry),
                  ),
                )
              else if (!_isInRootWorkspace)
                _MessagePanel(
                  icon: Icons.domain_disabled_outlined,
                  title: l10n.settingsMobileVersionsWorkspaceRequiredTitle,
                  description:
                      l10n.settingsMobileVersionsWorkspaceRequiredDescription,
                )
              else if (!_hasAccess)
                _MessagePanel(
                  icon: Icons.lock_outline_rounded,
                  title: l10n.settingsMobileVersionsAccessDeniedTitle,
                  description:
                      l10n.settingsMobileVersionsAccessDeniedDescription,
                )
              else ...[
                _PlatformPoliciesGrid(
                  iosCard: _PlatformPolicyCard(
                    platform: _MobilePlatform.ios,
                    effectiveController: _iosEffectiveController,
                    minimumController: _iosMinimumController,
                    otpEnabled: _iosOtpEnabled,
                    onOtpEnabledChanged: (value) =>
                        _updateState(() => _iosOtpEnabled = value),
                    storeUrlController: _iosStoreUrlController,
                    validationErrors: _validationErrors,
                  ),
                  androidCard: _PlatformPolicyCard(
                    platform: _MobilePlatform.android,
                    effectiveController: _androidEffectiveController,
                    minimumController: _androidMinimumController,
                    otpEnabled: _androidOtpEnabled,
                    onOtpEnabledChanged: (value) =>
                        _updateState(() => _androidOtpEnabled = value),
                    storeUrlController: _androidStoreUrlController,
                    validationErrors: _validationErrors,
                  ),
                  webCard: _WebOtpCard(
                    enabled: _webOtpEnabled,
                    onChanged: (value) =>
                        _updateState(() => _webOtpEnabled = value),
                  ),
                ),
                const shad.Gap(20),
                Align(
                  alignment: Alignment.centerLeft,
                  child: shad.PrimaryButton(
                    key: const Key('mobileVersionsSaveButton'),
                    onPressed: _isSaving || !_isDirty
                        ? null
                        : () => unawaited(_savePolicies()),
                    child: _isSaving
                        ? Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const SizedBox(
                                width: 16,
                                height: 16,
                                child: NovaLoadingIndicator(size: 20),
                              ),
                              const shad.Gap(8),
                              Text(l10n.settingsMobileVersionsSaving),
                            ],
                          )
                        : Text(l10n.settingsMobileVersionsSave),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
