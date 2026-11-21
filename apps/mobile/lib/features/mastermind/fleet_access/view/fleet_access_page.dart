import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_segmented_control.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_access_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_link_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_requests_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_status_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/fleet_access_routes.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_grantee_dock.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_notice.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_link_view.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_requests_view.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_status_view.dart';
import 'package:mobile/features/mastermind/view/mastermind_states.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_segmented_control.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';

/// `/mastermind/fleet-access`: what a Fleet grant lets this person read and
/// file. Shown only while `GET /api/v1/fleet/access` answers enabled; the
/// router sends anyone else away, and a 403 from any Fleet call re-checks.
class FleetAccessPage extends StatefulWidget {
  const FleetAccessPage({
    this.initialView = FleetAccessView.status,
    this.now,
    super.key,
  });

  final FleetAccessView initialView;
  final DateTime Function()? now;

  @override
  State<FleetAccessPage> createState() => _FleetAccessPageState();
}

class _FleetAccessPageState extends State<FleetAccessPage>
    with WidgetsBindingObserver {
  late final FleetAccessCubit _access = context.read<FleetAccessCubit>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_access.ensureLoaded());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // A grant can end while the app is away.
    if (state == AppLifecycleState.resumed) {
      unawaited(_access.sync(quiet: true));
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      ShellTitleOverride(
        ownerId: 'mastermind-fleet-access',
        locations: const {Routes.mastermindFleetAccess},
        title: context.l10n.mastermindFleetAccessTitle,
        showLeadingBrand: false,
      ),
      const FleetAccessGranteeDock(),
      Expanded(
        child: BlocConsumer<FleetAccessCubit, FleetAccessState>(
          bloc: _access,
          // An account switch forgets the answer; ask again for this screen.
          listenWhen: (_, current) =>
              current.status == FleetAccessStatus.initial,
          listener: (_, _) => unawaited(_access.ensureLoaded()),
          buildWhen: (previous, current) =>
              previous.visible != current.visible ||
              previous.access != current.access ||
              previous.failure != current.failure,
          builder: (context, state) => switch (state) {
            _ when state.visible => _FleetAccessContent(
              access: state.access,
              initialView: widget.initialView,
              now: widget.now,
            ),
            // A check that could not finish stays here with a retry; the
            // router sends a refused account away.
            FleetAccessState(status: FleetAccessStatus.error, :final failure?)
                when !state.denied =>
              AppPageListView(
                children: [
                  FleetAccessFailureMessage(
                    failure: failure,
                    onRetry: () => unawaited(_access.sync()),
                  ),
                ],
              ),
            _ => const MastermindSkeleton(),
          },
        ),
      ),
    ],
  );
}

class _FleetAccessContent extends StatefulWidget {
  const _FleetAccessContent({
    required this.access,
    required this.initialView,
    this.now,
  });

  final FleetAccess access;
  final FleetAccessView initialView;
  final DateTime Function()? now;

  @override
  State<_FleetAccessContent> createState() => _FleetAccessContentState();
}

class _FleetAccessContentState extends State<_FleetAccessContent> {
  late final FleetAccessCubit _access;
  late final FleetStatusCubit _status;
  late final FleetRequestsCubit _requests;
  late final FleetLinkCubit _link;
  late FleetAccessView _view = _admitted(widget.initialView);
  final _loaded = <FleetAccessView>{};

  FleetAccessView _admitted(FleetAccessView view) =>
      view == FleetAccessView.approvals && !widget.access.approves
      ? FleetAccessView.status
      : view;

  @override
  void initState() {
    super.initState();
    _access = context.read<FleetAccessCubit>();
    _status = FleetStatusCubit(
      source: _access.source,
      onForbidden: _access.handleForbidden,
    );
    _requests = FleetRequestsCubit(
      source: _access.source,
      onForbidden: _access.handleForbidden,
    );
    _link = FleetLinkCubit(
      source: _access.source,
      onForbidden: _access.handleForbidden,
    );
    _open(_view);
  }

  @override
  void didUpdateWidget(covariant _FleetAccessContent oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A narrower grant can take Approvals away while it is open.
    final admitted = _admitted(_view);
    if (admitted != _view) _select(admitted);
  }

  // Each view reads on first open; later reads come from pull to refresh.
  void _open(FleetAccessView view) {
    if (!_loaded.add(view)) return;
    switch (view) {
      case FleetAccessView.status:
        unawaited(_status.load());
      case FleetAccessView.requests:
        unawaited(_requests.load());
      case FleetAccessView.link || FleetAccessView.approvals:
        break;
    }
  }

  void _select(FleetAccessView view) {
    setState(() => _view = view);
    _open(view);
  }

  Future<void> _refresh() async {
    await Future.wait([
      _access.sync(quiet: true),
      switch (_view) {
        FleetAccessView.status => _status.load(),
        FleetAccessView.requests => _requests.load(),
        FleetAccessView.link ||
        FleetAccessView.approvals => Future<void>.value(),
      },
    ]);
  }

  @override
  void dispose() {
    unawaited(_status.close());
    unawaited(_requests.close());
    unawaited(_link.close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final header = MastermindSegmentedControl<FleetAccessView>(
      segments: [
        AppSegment(
          value: FleetAccessView.status,
          label: l10n.mastermindFleetAccessViewStatus,
        ),
        AppSegment(
          value: FleetAccessView.requests,
          label: l10n.mastermindFleetAccessViewRequests,
        ),
        AppSegment(
          value: FleetAccessView.link,
          label: l10n.mastermindFleetAccessViewLink,
        ),
        if (widget.access.approves)
          AppSegment(
            value: FleetAccessView.approvals,
            label: l10n.mastermindFleetAccessViewApprovals,
          ),
      ],
      selected: _view,
      onChanged: _select,
    );
    final children = switch (_view) {
      FleetAccessView.status => [
        FleetStatusView(cubit: _status, now: widget.now),
      ],
      FleetAccessView.requests => [
        FleetRequestsView(
          cubit: _requests,
          access: widget.access,
          now: widget.now,
        ),
      ],
      FleetAccessView.link => [FleetLinkView(cubit: _link, now: widget.now)],
      // No API lists or decides approvals for this person yet.
      FleetAccessView.approvals => [
        AppStateMessage(
          icon: LucideIcons.listChecks,
          title: l10n.mastermindFleetAccessApprovalsUnavailable,
        ),
      ],
    };
    return NovaRefreshIndicator(
      onRefresh: _refresh,
      child: AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverList.list(
            children: [
              header,
              const SizedBox(height: AppSpacing.lg),
              ...children,
            ],
          ),
        ],
      ),
    );
  }
}
