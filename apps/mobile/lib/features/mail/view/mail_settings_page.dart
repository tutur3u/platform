import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/data/mail_settings_snapshot.dart';
import 'package:mobile/features/mail/view/mail_image_preference.dart';
import 'package:mobile/features/mail/view/mail_organization_page.dart';
import 'package:mobile/features/mail/view/mail_primary_action_preference.dart';
import 'package:mobile/features/mail/view/mail_settings_chrome.dart';
import 'package:mobile/features/mail/view/mail_settings_controls.dart';
import 'package:mobile/features/mail/view/mail_swipe_preferences.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
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
    _awaitingConfirmation = _hadPendingSettings;
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

  bool get _canEdit =>
      widget.canManage && !widget.readOnlySnapshot && !_settingsRejected;

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

  bool
  get _hasUnresolvedSettings => OfflineMutationQueue.instance.pending.value.any(
    (edit) =>
        edit.userId == currentCacheUserId() &&
        edit.workspaceId == widget.workspaceId &&
        edit.isMailSettings &&
        edit.path ==
            '${MailRepository.mailboxPath(widget.workspaceId, widget.mailboxId)}/settings',
  );
  bool get _canChangeSettings =>
      _canEdit && !_hasUnresolvedSettings && !_awaitingConfirmation;

  void _mailboxRevoked() {
    if (widget.repository.settingsRevoked?.value !=
        (
          widget.workspaceId,
          '${MailRepository.mailboxPath(widget.workspaceId, widget.mailboxId)}/settings',
        )) {
      return;
    }
    if (!mounted) return;
    _loadGeneration++;
    _clearSettings();
    setState(() {
      _settingsRejected = true;
      _failed = true;
      _busy = false;
    });
  }

  void _pendingSettingsChanged() {
    final pending = _hasPendingSettings;
    final resolved = _hadPendingSettings && !pending;
    _hadPendingSettings = pending;
    if (pending || resolved) _awaitingConfirmation = true;
    final rejected = OfflineMutationQueue.instance.pending.value.any(
      (edit) =>
          edit.userId == currentCacheUserId() &&
          edit.workspaceId == widget.workspaceId &&
          edit.isMailSettings &&
          edit.path ==
              '${MailRepository.mailboxPath(widget.workspaceId, widget.mailboxId)}/settings' &&
          edit.status == PendingMutationStatus.failed,
    );
    if (rejected && mounted) {
      _loadGeneration++;
      _clearSettings();
      setState(() {
        _settingsRejected = true;
        _failed = true;
        _busy = false;
      });
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
    if (!_canChangeSettings ||
        !_scopeCurrent ||
        _saving ||
        !_hasSnapshot ||
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
        if (error is ApiException &&
            !error.isVerificationRequired &&
            error.code != 'MFA_REQUIRED' &&
            (error.statusCode == 401 ||
                error.statusCode == 403 ||
                error.statusCode == 404)) {
          _clearSettings();
          setState(() {
            _settingsRejected = true;
            _failed = true;
          });
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
        onSave: _canChangeSettings && _hasSnapshot && !_busy && !_saving
            ? _save
            : null,
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
                            child: AppAlert(
                              leading: const Icon(LucideIcons.cloudOff),
                              content: Text(l10n.mailSettingsReadOnly),
                            ),
                          ),
                        if (_failed)
                          Padding(
                            padding: const EdgeInsets.only(
                              bottom: AppSpacing.md,
                            ),
                            child: AppButton.outline(
                              onPressed: _load,
                              child: Text(l10n.commonRetry),
                            ),
                          ),
                        ..._formSections(context),
                      ],
                    ),
                  ),
                ),
        ),
      ),
    );
  }

  List<Widget> _formSections(BuildContext context) {
    final l10n = context.l10n;
    final editable = _canChangeSettings;
    final showServer = _canEdit || widget.readOnlySnapshot;
    List<AppSelectOption<String>> options(Map<String, String> choices) => [
      for (final entry in choices.entries)
        AppSelectOption(value: entry.key, label: entry.value),
    ];
    Widget section(String title, List<Widget> rows) => Padding(
      padding: const EdgeInsets.only(bottom: SettingsRowLayout.groupGap),
      child: SettingsCompactSection(title: title, children: rows),
    );
    return [
      section(l10n.mailSettingsReadingGroup, [
        SettingsSwitchRow(
          icon: LucideIcons.image,
          title: l10n.mailLoadImages,
          subtitle: l10n.mailLoadImagesDescription,
          value: MailImagePreference.instance.value,
          onChanged: (enabled) =>
              unawaited(MailImagePreference.instance.select(enabled: enabled)),
        ),
        SettingsChoiceRow<String>(
          icon: LucideIcons.mousePointerClick,
          title: l10n.mailDefaultAction,
          value: MailPrimaryActionPreference.instance.value.name,
          options: options({
            for (final option in MailPrimaryAction.values)
              option.name: option.label(context),
          }),
          onChanged: (name) => unawaited(
            MailPrimaryActionPreference.instance.select(
              MailPrimaryAction.values.byName(name),
            ),
          ),
        ),
        if (widget.swipePreferences != null)
          SettingsTile(
            grouped: true,
            icon: LucideIcons.pointer,
            title: l10n.mailSwipeActions,
            onTap: () =>
                showMailSwipeSettings(context, widget.swipePreferences!),
          ),
      ]),
      if (showServer) ...[
        MailSettingsPendingStatus(
          workspaceId: widget.workspaceId,
          mailboxId: widget.mailboxId,
        ),
        section(l10n.mailSettingsComposeGroup, [
          SettingsFieldRow(
            child: AppTextField(
              controller: _sender,
              enabled: editable,
              maxLength: 160,
              label: l10n.mailSenderName,
              placeholder: l10n.mailSenderNamePlaceholder,
              helperText: l10n.mailSenderNameHelper,
              textCapitalization: TextCapitalization.words,
            ),
          ),
          SettingsFieldRow(
            child: AppTextField(
              controller: _signature,
              enabled: editable,
              minLines: 3,
              maxLines: 8,
              label: l10n.mailSignature,
              placeholder: l10n.mailSignaturePlaceholder,
              helperText: l10n.mailSignatureHelper,
            ),
          ),
        ]),
        section(l10n.mailSettingsAiGroup, [
          SettingsSwitchRow(
            icon: LucideIcons.sparkles,
            title: l10n.mailAutoDraft,
            subtitle: l10n.mailAutoDraftDescription,
            value: _autoDraft,
            onChanged: editable ? (v) => setState(() => _autoDraft = v) : null,
          ),
          SettingsFieldRow(
            child: AppTextField(
              key: const ValueKey('mail-settings-instructions'),
              controller: _instructions,
              enabled: editable,
              minLines: 3,
              maxLines: 8,
              label: l10n.mailDraftInstructions,
              placeholder: l10n.mailDraftInstructionsPlaceholder,
              helperText: l10n.mailDraftInstructionsHelper,
            ),
          ),
        ]),
        section(l10n.mailSettingsDeliveryGroup, [
          SettingsChoiceRow<String>(
            icon: LucideIcons.send,
            title: l10n.mailDeliveryProvider,
            value: _provider ?? 'default',
            options: options({
              'default': l10n.mailDomainDefault,
              'cloudflare': 'Cloudflare',
              'ses': 'Amazon SES',
            }),
            onChanged: editable
                ? (value) => setState(
                    () => _provider = value == 'default' ? null : value,
                  )
                : null,
          ),
          if (_group == null) ...[
            SettingsSwitchRow(
              icon: LucideIcons.tags,
              title: l10n.mailSmartLabels,
              value: _smartLabels,
              onChanged: editable
                  ? (v) => setState(() => _smartLabels = v)
                  : null,
            ),
            SettingsChoiceRow<String>(
              icon: LucideIcons.forward,
              title: l10n.mailForwarding,
              value: _forwarding,
              options: options({
                'off': l10n.mailForwardingOff,
                'catch_all': l10n.mailCatchAll,
                'mailbox': l10n.mailMailbox,
              }),
              onChanged: editable
                  ? (value) => setState(() => _forwarding = value)
                  : null,
            ),
            if (_forwarding == 'mailbox')
              SettingsFieldRow(
                child: AppTextField(
                  controller: _forwardTo,
                  enabled: editable,
                  keyboardType: TextInputType.emailAddress,
                  label: l10n.mailForwardTo,
                  placeholder: l10n.mailForwardToPlaceholder,
                ),
              ),
          ],
        ]),
        if (_group != null)
          section(l10n.mailSettingsGroupPermissions, [
            for (final field in {
              'posting': (l10n.mailGroupPosting, LucideIcons.messageSquare),
              'attachments': (l10n.mailGroupAttachments, LucideIcons.paperclip),
              'sendAs': (l10n.mailGroupSendAs, LucideIcons.userPen),
            }.entries)
              SettingsChoiceRow<String>(
                icon: field.value.$2,
                title: field.value.$1,
                value: _group![field.key] as String,
                options: options({
                  if (field.key != 'sendAs') 'anyone': l10n.mailAnyone,
                  if (field.key != 'sendAs')
                    'organization': l10n.mailOrganization,
                  'members': l10n.mailMembers,
                  'managers': l10n.mailManagers,
                }),
                onChanged: editable
                    ? (value) => setState(() => _group![field.key] = value)
                    : null,
              ),
          ]),
        if (_canEdit)
          section(l10n.mailSettingsOrganizeGroup, [
            for (final section in {
              'labels': (l10n.mailLabels, LucideIcons.tag),
              'folders': (l10n.mailFolders, LucideIcons.folder),
              'members': (l10n.mailMembers, LucideIcons.users),
            }.entries)
              SettingsTile(
                grouped: true,
                icon: section.value.$2,
                title: section.value.$1,
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
          ]),
      ],
    ];
  }
}
