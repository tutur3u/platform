import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/realtime/cloudflare_channel.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/finance/finance_module.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/view/bill_split_activity_panel.dart';
import 'package:mobile/features/finance/view/bill_split_create_sheet.dart';
import 'package:mobile/features/finance/view/bill_split_settlement_view.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class BillSplitsPage extends StatelessWidget {
  const BillSplitsPage({
    this.splitId,
    this.participantId,
    this.settlement = false,
    super.key,
  });

  final String? splitId;
  final String? participantId;
  final bool settlement;

  @override
  Widget build(BuildContext context) {
    final workspace = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    final actor = context.select<AuthCubit, String?>(
      (cubit) => cubit.state.user?.id,
    );
    final l10n = context.l10n;
    return Stack(
      fit: StackFit.expand,
      children: [
        ShellTitleOverride(
          ownerId: 'finance-bill-splits',
          locations: const {Routes.financeBillSplits},
          title: settlement
              ? l10n.financeBillSplitSettlement
              : l10n.financeBillSplits,
          showLeadingBrand: false,
          showAvatar: false,
        ),
        const FinanceAmountVisibilityShellAction(
          ownerId: 'finance-bill-split-amount-visibility',
          locations: {Routes.financeBillSplits},
        ),
        if (financeBillSplitsEnabled && workspace != null && actor != null)
          _BillSplitContent(
            key: ValueKey((workspace, actor, splitId)),
            workspace: workspace,
            splitId: splitId,
            participantId: participantId,
          )
        else
          AppPageListView(
            children: [
              AppStateMessage(
                icon: LucideIcons.receipt,
                title: l10n.financeBillSplitsUnavailable,
              ),
            ],
          ),
      ],
    );
  }
}

class _BillSplitContent extends StatefulWidget {
  const _BillSplitContent({
    required this.workspace,
    this.splitId,
    this.participantId,
    super.key,
  });

  final String workspace;
  final String? splitId;
  final String? participantId;

  @override
  State<_BillSplitContent> createState() => _BillSplitContentState();
}

class _BillSplitContentState extends State<_BillSplitContent> {
  final _api = ApiClient();
  late Future<Map<String, dynamic>> _response = _load();
  CloudflareChannel? _channel;
  Timer? _invalidation;

  String get _splitPath =>
      '/api/v1/workspaces/${Uri.encodeComponent(widget.workspace)}/finance/bill-splits';

  @override
  void initState() {
    super.initState();
    final split = widget.splitId;
    if (split == null ||
        !const bool.fromEnvironment('ENABLE_FINANCE_BILL_SPLIT_REALTIME')) {
      return;
    }
    final channel = CloudflareChannel(
      resolveTicket: () => _api.postJson('/api/v1/realtime/channels', {
        'topic': 'finance-bill-split:${widget.workspace}:$split',
      }),
      onMessage: (event) {
        if (event['type'] != 'broadcast' || event['event'] != 'activity') {
          return;
        }
        _invalidation ??= Timer(const Duration(milliseconds: 250), () {
          _invalidation = null;
          _reload();
        });
      },
    );
    _channel = channel;
    unawaited(channel.connect(retryOnFailure: false).catchError((Object _) {}));
  }

  void _reload() {
    if (mounted) setState(() => _response = _load());
  }

  Future<Map<String, dynamic>> _load() {
    final query = widget.splitId == null
        ? ''
        : '?id=${Uri.encodeQueryComponent(widget.splitId!)}';
    return _api.getJson('$_splitPath$query');
  }

  @override
  void dispose() {
    _invalidation?.cancel();
    unawaited(_channel?.close());
    _api.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return FutureBuilder(
      future: _response,
      builder: (context, snapshot) {
        final data = snapshot.data?['data'];
        final children = switch (data) {
          List<Object?>() => _list(context, data),
          Map<String, dynamic>() => <Widget>[
            BillSplitSettlementView(
              split: data,
              participantId: widget.participantId,
            ),
            if (widget.splitId case final id? when widget.participantId == null)
              BillSplitActivityPanel(
                api: _api,
                path: '$_splitPath/${Uri.encodeComponent(id)}/activity',
                split: data,
                onUpdate: _reload,
              ),
          ],
          _ when snapshot.connectionState == ConnectionState.done => <Widget>[
            AppStateMessage(
              icon: LucideIcons.circleAlert,
              title: l10n.financeBillSplitsUnavailable,
              actionLabel: l10n.commonRetry,
              onAction: () => setState(() => _response = _load()),
            ),
          ],
          _ => <Widget>[const AppSkeletonRows()],
        };
        return AppPageListView(children: children);
      },
    );
  }

  List<Widget> _list(BuildContext context, List<Object?> splits) {
    return [
      if (canManageFinance(context, 'create_transactions'))
        AppButton.primary(
          onPressed: _create,
          child: Text(context.l10n.financeBillSplitNew),
        ),
      if (splits.isEmpty)
        AppStateMessage(
          icon: LucideIcons.receipt,
          title: context.l10n.financeBillSplitsEmpty,
        )
      else
        AppGroupedCard(
          children: [
            for (final split in splits.whereType<Map<String, dynamic>>())
              AppRichRow(
                leading: const AppIconTile(icon: LucideIcons.receipt),
                title: split['title'] as String,
                onTap: () => context.push(
                  Uri(
                    path: Routes.financeBillSplits,
                    queryParameters: {'split': split['id'] as String},
                  ).toString(),
                ),
              ),
          ],
        ),
    ];
  }

  Future<void> _create() async {
    final split = await showAppSheet<String>(
      context: context,
      size: AppSheetSize.large,
      builder: (_) =>
          BillSplitCreateSheet(workspaceId: widget.workspace, api: _api),
    );
    if (!mounted || split == null) return;
    setState(() => _response = _load());
    await context.push(
      Uri(
        path: Routes.financeBillSplits,
        queryParameters: {'split': split},
      ).toString(),
    );
  }
}
