import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_repository.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_intent_draft.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_notice.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_request_fields.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens the typed request form full screen above the shell, so neither the
/// dock nor the shell top bar sits over it. Resolves to the sent request.
Future<FleetIntentDraft?> showFleetRequestForm(
  BuildContext context, {
  required FleetAccess access,
  required Future<void> Function(FleetIntentDraft draft) submit,
}) => Navigator.of(context, rootNavigator: true).push<FleetIntentDraft>(
  MaterialPageRoute<FleetIntentDraft>(
    fullscreenDialog: true,
    builder: (_) => FleetRequestFormPage(access: access, submit: submit),
  ),
);

/// One typed request: a kind the grant can file, a project in the grant and
/// the enumerated fields that kind takes. The server resolves the target,
/// authorises and caps it; a refusal stays on the form.
class FleetRequestFormPage extends StatefulWidget {
  const FleetRequestFormPage({
    required this.access,
    required this.submit,
    super.key,
  });

  final FleetAccess access;
  final Future<void> Function(FleetIntentDraft draft) submit;

  @override
  State<FleetRequestFormPage> createState() => _FleetRequestFormPageState();
}

class _FleetRequestFormPageState extends State<FleetRequestFormPage> {
  late final List<FleetIntentKind> _kinds = [
    for (final kind in FleetIntentKind.values)
      if (kind.offeredBy(widget.access)) kind,
  ];
  late final FleetIntentDraft _initial = FleetIntentDraft(
    kind: _kinds.firstOrNull ?? FleetIntentKind.statusQuestion,
    projectKey: widget.access.projects.length == 1
        ? widget.access.projects.single
        : null,
  );
  late FleetIntentDraft _draft = _initial;
  bool _attempted = false;
  bool _sending = false;
  FleetAccessFailure? _failure;

  void _update(FleetIntentDraft Function(FleetIntentDraft draft) change) =>
      setState(() {
        _draft = change(_draft);
        _failure = null;
      });

  Future<void> _send() async {
    setState(() => _attempted = true);
    if (_draft.validate().isNotEmpty) return;
    setState(() {
      _sending = true;
      _failure = null;
    });
    try {
      await widget.submit(_draft);
      if (mounted) Navigator.of(context).pop(_draft);
    } on FleetAccessException catch (error) {
      if (mounted) {
        setState(() {
          _sending = false;
          _failure = error.failure;
        });
      }
    }
  }

  /// A filled form asks before it is thrown away.
  Future<void> _confirmDiscard() async {
    final l10n = context.l10n;
    final discard = await showAppConfirmDialog(
      context: context,
      title: l10n.mastermindFleetAccessDiscardTitle,
      confirmLabel: l10n.mastermindFleetAccessDiscard,
      cancelLabel: l10n.mastermindFleetAccessKeepEditing,
      destructive: true,
    );
    if (discard && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final l10n = context.l10n;
    final errors = _attempted
        ? _draft.validate()
        : const <FleetDraftField, FleetDraftError>{};
    return PopScope(
      canPop: !_sending && _draft == _initial,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_sending) unawaited(_confirmDiscard());
      },
      child: Scaffold(
        backgroundColor: tokens.colorScheme.background,
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 56),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Row(
                    spacing: 8,
                    children: [
                      AppIconButton(
                        icon: const Icon(LucideIcons.x),
                        tooltip: l10n.commonCancel,
                        onPressed: _sending
                            ? null
                            : () => Navigator.of(context).maybePop(),
                      ),
                      Expanded(
                        child: Semantics(
                          header: true,
                          child: Text(
                            l10n.mastermindFleetAccessNewRequest,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: tokens.typography.title,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final gutter = AppPageInsets.gutterOf(
                      context,
                      width: constraints.maxWidth,
                    );
                    return Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 640),
                        child: ListView(
                          keyboardDismissBehavior:
                              ScrollViewKeyboardDismissBehavior.onDrag,
                          padding: EdgeInsets.fromLTRB(gutter, 12, gutter, 24),
                          children: [
                            if (_failure case final failure?) ...[
                              FleetAccessNotice(failure: failure),
                              const SizedBox(height: AppSpacing.md),
                            ],
                            FleetRequestFields(
                              draft: _draft,
                              kinds: _kinds,
                              projects: widget.access.projects,
                              needsOwnerApproval: _draft.kind
                                  .needsOwnerApproval(widget.access),
                              errors: errors,
                              enabled: !_sending,
                              onChanged: _update,
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
              DecoratedBox(
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: tokens.colorScheme.border),
                  ),
                ),
                child: SafeArea(
                  top: false,
                  minimum: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: Center(
                    heightFactor: 1,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 592),
                      child: SizedBox(
                        width: double.infinity,
                        child: AppButton.primary(
                          key: const ValueKey('fleet-access-submit'),
                          loading: _sending,
                          onPressed: _sending ? null : () => unawaited(_send()),
                          child: Text(l10n.mastermindFleetAccessSubmit),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
