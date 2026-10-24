import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/features/mail/data/mail_settings_snapshot.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_image_preference.dart';
import 'package:mobile/features/mail/view/mail_organization_page.dart';
import 'package:mobile/features/mail/view/mail_primary_action_preference.dart';
import 'package:mobile/features/mail/view/mail_settings_chrome.dart';
import 'package:mobile/features/mail/view/mail_settings_controls.dart';
import 'package:mobile/features/mail/view/mail_swipe_preferences.dart';
import 'package:mobile/l10n/l10n.dart';

part 'mail_settings_page_data.dart';

class MailSettingsPage extends StatefulWidget {
  const MailSettingsPage({
    required this.repository,
    required this.workspaceId,
    required this.mailboxId,
    this.swipePreferences,
    this.canManage = true,
    this.readOnlySnapshot = false,
    this.shellLocations = const {Routes.mail},
    this.isScopeCurrent,
    super.key,
  });
  final MailRepository repository;
  final String workspaceId;
  final String mailboxId;
  final MailSwipePreferences? swipePreferences;
  final bool canManage;
  final bool readOnlySnapshot;
  final Set<String> shellLocations;
  final bool Function()? isScopeCurrent;
  @override
  State<MailSettingsPage> createState() => _MailSettingsPageState();
}

class _MailSettingsPageState extends State<MailSettingsPage> {
  final _sender = TextEditingController();
  final _signature = TextEditingController();
  final _instructions = TextEditingController();
  final _forwardTo = TextEditingController();
  bool _busy = true;
  bool _failed = false;
  bool _hasSnapshot = false;
  int _loadGeneration = 0;
  bool _autoDraft = false;
  bool _smartLabels = false;
  String _forwarding = 'off';
  String? _provider;
  Map<String, dynamic> _editBaseline = {};
  bool _settingsRejected = false;
  bool _awaitingConfirmation = false;
  String? _savedDraft;
  bool _saving = false;
  bool _confirmingExit = false;
  bool _allowExit = false;
  bool _hadPendingSettings = false;
  Map<String, dynamic>? _group;

  void _updateSettingsState(VoidCallback update) => setState(update);

  @override
  void initState() {
    super.initState();
    for (final controller in [_sender, _signature, _instructions, _forwardTo]) {
      controller.addListener(_draftChanged);
    }
    MailImagePreference.instance.addListener(_imagePreferenceChanged);
    MailPrimaryActionPreference.instance.addListener(_imagePreferenceChanged);
    unawaited(MailImagePreference.instance.load());
    unawaited(MailPrimaryActionPreference.instance.load());
    widget.repository.accessRevoked?.addListener(_accessRevoked);
    widget.repository.settingsRevoked?.addListener(_mailboxRevoked);
    _hadPendingSettings = _hasPendingSettings;
    OfflineMutationQueue.instance.pending.addListener(_pendingSettingsChanged);
    OfflineMutationQueue.instance.syncRevision.addListener(_syncFinished);
    if (_canEdit || widget.readOnlySnapshot) {
      unawaited(_load(background: true));
    } else {
      _busy = false;
    }
  }

  void _imagePreferenceChanged() {
    if (mounted) {
      setState(() {});
    }
  }

  @override
  void dispose() {
    widget.repository.accessRevoked?.removeListener(_accessRevoked);
    widget.repository.settingsRevoked?.removeListener(_mailboxRevoked);
    OfflineMutationQueue.instance.pending.removeListener(
      _pendingSettingsChanged,
    );
    OfflineMutationQueue.instance.syncRevision.removeListener(_syncFinished);
    MailImagePreference.instance.removeListener(_imagePreferenceChanged);
    MailPrimaryActionPreference.instance.removeListener(
      _imagePreferenceChanged,
    );
    for (final c in [_sender, _signature, _instructions, _forwardTo]) {
      c
        ..removeListener(_draftChanged)
        ..dispose();
    }
    super.dispose();
  }

  void _draftChanged() {
    if (mounted) {
      setState(() => _allowExit = false);
    }
  }

  String get _draft => jsonEncode([
    _sender.text,
    _signature.text,
    _instructions.text,
    _forwardTo.text,
    _autoDraft,
    _smartLabels,
    _forwarding,
    _provider,
    _group,
  ]);
  bool get _dirty => _canEdit && _savedDraft != null && _draft != _savedDraft;

  Future<void> _exit() async {
    if (_saving || _confirmingExit) {
      return;
    }
    if (_dirty && !_allowExit) {
      _confirmingExit = true;
      final discard = await showAppConfirmDialog(
        context: context,
        title: context.l10n.mailDiscardSettingsTitle,
        message: context.l10n.mailDiscardSettingsDescription,
        cancelLabel: context.l10n.commonCancel,
        confirmLabel: context.l10n.mailDiscardSettingsAction,
        destructive: true,
      );
      _confirmingExit = false;
      if (!mounted || !discard) {
        return;
      }
    }
    if (!mounted) {
      return;
    }
    setState(() => _allowExit = true);
    await WidgetsBinding.instance.endOfFrame;
    if (mounted) {
      await Navigator.of(context).maybePop();
    }
  }

  bool get _canEdit => widget.canManage && !widget.readOnlySnapshot && !_settingsRejected;

  bool get _scopeCurrent => widget.isScopeCurrent?.call() ?? true;

  bool
  get _hasPendingSettings => OfflineMutationQueue.instance.pending.value.any(
    (edit) =>
        edit.userId == currentCacheUserId() &&
        edit.workspaceId == widget.workspaceId &&
        edit.isMailSettings &&
        edit.status != PendingMutationStatus.failed &&
        edit.method == 'PATCH' &&
        edit.path ==
            '${MailRepository.mailboxPath(widget.workspaceId, widget.mailboxId)}/settings',
  );

  bool get _hasUnresolvedSettings => OfflineMutationQueue.instance.pending.value.any((edit) =>
    edit.userId == currentCacheUserId() && edit.workspaceId == widget.workspaceId &&
    edit.isMailSettings && edit.path == '${MailRepository.mailboxPath(widget.workspaceId, widget.mailboxId)}/settings');
  bool get _canChangeSettings => _canEdit && !_hasUnresolvedSettings && !_awaitingConfirmation;

  void _mailboxRevoked() {
    if (widget.repository.settingsRevoked?.value !=
        (widget.workspaceId, '${MailRepository.mailboxPath(widget.workspaceId, widget.mailboxId)}/settings')) return;
    if (!mounted) return;
    _loadGeneration++;
    _clearSettings();
    setState(() { _settingsRejected = true; _failed = true; _busy = false; });
  }

  void _pendingSettingsChanged() {
    final pending = _hasPendingSettings;
    final resolved = _hadPendingSettings && !pending;
    _hadPendingSettings = pending;
    final rejected = OfflineMutationQueue.instance.pending.value.any((edit) =>
      edit.userId == currentCacheUserId() && edit.workspaceId == widget.workspaceId &&
      edit.isMailSettings && edit.path == '${MailRepository.mailboxPath(widget.workspaceId, widget.mailboxId)}/settings' &&
      edit.status == PendingMutationStatus.failed);
    if (rejected && mounted) {
      _loadGeneration++;
      _clearSettings();
      setState(() { _settingsRejected = true; _failed = true; _busy = false; });
    } else if (resolved) {
      _syncFinished();
    } else if (mounted) {
      setState(() {});
    }
  }

  void _syncFinished() {
    if (mounted &&
        _scopeCurrent &&
        !_saving &&
        (_canEdit || widget.readOnlySnapshot)) {
      unawaited(_load(background: true));
    }
  }

  void _accessRevoked() {
    if (!mounted ||
        widget.repository.accessRevoked?.value != widget.workspaceId) {
      return;
    }
    _loadGeneration++;
    _clearSettings();
    setState(() {
      _failed = true;
      _busy = false;
    });
  }

  Future<void> _save() async {
    if (!_canChangeSettings || !_scopeCurrent || _saving || !_hasSnapshot ||
        mailSettingsChanges(_editBaseline, _formSettings).isEmpty) {
      return;
    }
    _loadGeneration++;
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      _saving = true;
      _allowExit = false;
    });
    try {
      await widget.repository.updateSettings(
        widget.workspaceId,
        widget.mailboxId,
        mailSettingsChanges(_editBaseline, _formSettings),
      );
      if (!mounted || !_scopeCurrent) {
        return;
      }
      setState(() {
        _savedDraft = _draft;
        _awaitingConfirmation = _hasPendingSettings;
        _allowExit = false;
      });
      if (!_hasPendingSettings) {
        setState(() => _allowExit = true);
        await WidgetsBinding.instance.endOfFrame;
        if (mounted && _scopeCurrent) {
          await Navigator.of(context).maybePop();
        }
      }
    } on Object catch (error) {
      if (mounted && _scopeCurrent) {
        if (error is ApiException && !error.isVerificationRequired &&
            error.code != 'MFA_REQUIRED' &&
            (error.statusCode == 401 || error.statusCode == 403 || error.statusCode == 404)) {
          _clearSettings();
          setState(() { _settingsRejected = true; _failed = true; });
        }
        showAppToast(context, message: context.l10n.commonSomethingWentWrong);
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return PopScope(
      canPop: _allowExit || (!_saving && !_dirty),
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) {
          unawaited(_exit());
        }
      },
      child: MailSettingsChrome(
        locations: widget.shellLocations,
        onBack: _exit,
        saving: _saving,
        backEnabled: !_saving,
        onSave: _canChangeSettings && _hasSnapshot && !_busy && !_saving ? _save : null,
        canManage: _canEdit,
        child: AppScaffold(
          child: _busy
              ? const MailSettingsSkeleton()
              : _failed && !_hasSnapshot
              ? Center(
                  child: AppButton.outline(
                    onPressed: _load,
                    child: Text(l10n.commonRetry),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: IgnorePointer(
                    ignoring: _saving,
                    child: AppPageListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      kind: AppPageKind.form,
                      children: [
                        if (widget.readOnlySnapshot)
                          Padding(
                            padding: const EdgeInsets.only(
                              bottom: AppSpacing.md,
                            ),
                            child: Text(l10n.mailSettingsReadOnly),
                          ),
                        if (_failed)
                          AppButton.outline(
                            onPressed: _load,
                            child: Text(l10n.commonRetry),
                          ),
                        AppToggleRow(
                          padding: const EdgeInsets.symmetric(
                            vertical: AppSpacing.md,
                          ),
                          title: Text(l10n.mailLoadImages),
                          subtitle: Text(l10n.mailLoadImagesDescription),
                          value: MailImagePreference.instance.value,
                          onChanged: (enabled) => unawaited(
                            MailImagePreference.instance.select(
                              enabled: enabled,
                            ),
                          ),
                        ),
                        MailSettingsSelect(
                          title: l10n.mailDefaultAction,
                          value:
                              MailPrimaryActionPreference.instance.value.name,
                          choices: {
                            for (final option in MailPrimaryAction.values)
                              option.name: option.label(context),
                          },
                          onChanged: (name) => unawaited(
                            MailPrimaryActionPreference.instance.select(
                              MailPrimaryAction.values.byName(name),
                            ),
                          ),
                        ),
                        if (widget.swipePreferences != null)
                          AppListTile(
                            leading: const Icon(Icons.swipe_outlined),
                            title: Text(l10n.mailSwipeActions),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => showMailSwipeSettings(
                              context,
                              widget.swipePreferences!,
                            ),
                          ),
                        if (_canEdit || widget.readOnlySnapshot) ...[
                          MailSettingsPendingStatus(
                            workspaceId: widget.workspaceId,
                            mailboxId: widget.mailboxId,
                          ),
                          AppTextField(
                            controller: _sender,
                            enabled: _canChangeSettings,
                            maxLength: 160,
                            label: l10n.mailSenderName,
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          AppTextField(
                            controller: _signature,
                            enabled: _canChangeSettings,
                            minLines: 3,
                            maxLines: 8,
                            label: l10n.mailSignature,
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          AppTextField(
                            controller: _instructions,
                            enabled: _canChangeSettings,
                            minLines: 3,
                            maxLines: 8,
                            label: l10n.mailAiInstructions,
                          ),
                          AppToggleRow(
                            padding: const EdgeInsets.symmetric(
                              vertical: AppSpacing.md,
                            ),
                            title: Text(l10n.mailAutoDraft),
                            value: _autoDraft,
                            onChanged: _canChangeSettings
                                ? (v) => setState(() => _autoDraft = v)
                                : null,
                          ),
                          MailSettingsSelect(
                            title: l10n.mailDeliveryProvider,
                            value: _provider ?? 'default',
                            choices: {
                              'default': l10n.mailDomainDefault,
                              'cloudflare': 'Cloudflare',
                              'ses': 'Amazon SES',
                            },
                            onChanged: _canChangeSettings
                                ? (value) => setState(
                                    () => _provider = value == 'default'
                                        ? null
                                        : value,
                                  )
                                : null,
                          ),
                          if (_group == null) ...[
                            AppToggleRow(
                              padding: const EdgeInsets.symmetric(
                                vertical: AppSpacing.md,
                              ),
                              title: Text(l10n.mailSmartLabels),
                              value: _smartLabels,
                              onChanged: _canChangeSettings
                                  ? (v) => setState(() => _smartLabels = v)
                                  : null,
                            ),
                            MailSettingsSelect(
                              title: l10n.mailForwarding,
                              value: _forwarding,
                              choices: {
                                'off': l10n.mailForwardingOff,
                                'catch_all': l10n.mailCatchAll,
                                'mailbox': l10n.mailMailbox,
                              },
                              onChanged: _canChangeSettings
                                  ? (value) =>
                                        setState(() => _forwarding = value)
                                  : null,
                            ),
                            if (_forwarding == 'mailbox')
                              AppTextField(
                                controller: _forwardTo,
                                enabled: _canChangeSettings,
                                keyboardType: TextInputType.emailAddress,
                                label: l10n.mailForwardTo,
                              ),
                          ],
                          if (_group != null) ...[
                            for (final field in {
                              'posting': l10n.mailGroupPosting,
                              'attachments': l10n.mailGroupAttachments,
                              'sendAs': l10n.mailGroupSendAs,
                            }.entries)
                              MailSettingsSelect(
                                title: field.value,
                                value: _group![field.key] as String,
                                choices: {
                                  if (field.key != 'sendAs')
                                    'anyone': l10n.mailAnyone,
                                  if (field.key != 'sendAs')
                                    'organization': l10n.mailOrganization,
                                  'members': l10n.mailMembers,
                                  'managers': l10n.mailManagers,
                                },
                                onChanged: _canChangeSettings
                                    ? (value) => setState(
                                        () => _group![field.key] = value,
                                      )
                                    : null,
                              ),
                          ],
                          if (_canEdit) const AppDivider(),
                          if (_canEdit)
                            for (final section in {
                              'labels': l10n.mailLabels,
                              'folders': l10n.mailFolders,
                              'members': l10n.mailMembers,
                            }.entries)
                              AppListTile(
                                title: Text(section.value),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () => Navigator.of(context).push<void>(
                                  MaterialPageRoute(
                                    builder: (_) => MailOrganizationPage(
                                      repository: widget.repository,
                                      workspaceId: widget.workspaceId,
                                      mailboxId: widget.mailboxId,
                                      kind: section.key,
                                    ),
                                  ),
                                ),
                              ),
                        ],
                      ],
                    ),
                  ),
                ),
        ),
      ),
    );
  }
}
