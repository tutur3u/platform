import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_requests_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_labels.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_notice.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_request_form_page.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_list_row.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_time_label.dart';
import 'package:mobile/l10n/l10n.dart';

/// Requests: New request, then the person's own receipts with their state.
class FleetRequestsView extends StatelessWidget {
  const FleetRequestsView({
    required this.cubit,
    required this.access,
    this.now,
    super.key,
  });

  final FleetRequestsCubit cubit;
  final FleetAccess access;
  final DateTime Function()? now;

  Future<void> _newRequest(BuildContext context) async {
    final sent = await showFleetRequestForm(
      context,
      access: access,
      submit: cubit.submit,
    );
    if (sent == true && context.mounted) {
      showAppToast(
        context,
        message: context.l10n.mastermindFleetAccessSubmitted,
        variant: AppAlertVariant.success,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final offered = FleetIntentKind.values.any((k) => k.offeredBy(access));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (offered) ...[
          AppButton.primary(
            key: const ValueKey('fleet-access-new-request'),
            leading: const Icon(LucideIcons.plus, size: 16),
            onPressed: () => unawaited(_newRequest(context)),
            child: Text(l10n.mastermindFleetAccessNewRequest),
          ),
          const SizedBox(height: AppSpacing.lg),
        ],
        BlocBuilder<FleetRequestsCubit, FleetRequestsState>(
          bloc: cubit,
          builder: (context, state) {
            final receipts = state.receipts;
            if (receipts == null) {
              if (state.failure case final failure?) {
                return FleetAccessFailureMessage(
                  failure: failure,
                  onRetry: () => unawaited(cubit.load()),
                );
              }
              return const AppSkeletonRows(count: 3);
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (state.failure case final failure?) ...[
                  FleetAccessNotice(failure: failure),
                  const SizedBox(height: AppSpacing.md),
                ],
                if (receipts.isEmpty)
                  AppStateMessage.inline(
                    icon: LucideIcons.inbox,
                    title: l10n.mastermindFleetAccessNoRequests,
                  )
                else
                  MastermindGroup(
                    children: [
                      for (final receipt in receipts)
                        _ReceiptRow(receipt: receipt),
                      if (state.hasMore)
                        MastermindListRow(
                          key: const ValueKey('fleet-access-show-older'),
                          title: l10n.mastermindFleetAccessShowOlder,
                          trailing: state.loadingMore
                              ? const AppLoadingIndicator.inline()
                              : null,
                          onTap: state.loadingMore
                              ? null
                              : () => unawaited(cubit.loadMore()),
                        ),
                    ],
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _ReceiptRow extends StatelessWidget {
  const _ReceiptRow({required this.receipt});

  final FleetIntentReceipt receipt;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppGroupedRow(
      title: Text(receipt.kind.label(l10n)),
      subtitle: MastermindTimeLabel(receipt.createdAt),
      trailing: MastermindStatusChip(
        label: receipt.state.label(l10n),
        tone: receipt.state.tone,
      ),
    );
  }
}
