import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/iris/iris_flag.dart';
import 'package:mobile/features/mastermind/iris/view/iris_chat_view.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/decisions_model.dart';
import 'package:mobile/features/mastermind/presentation/freshness.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/inbox_paging.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/presentation/open_asks.dart';
import 'package:mobile/features/mastermind/replies/answered_elsewhere_cubit.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/features/mastermind/view/inbox/decisions_body.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_filters.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_list_body.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_segment_bar.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_what_needs_me.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/inbox/pending_replies_section.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/mastermind/view/widgets/collapsible_search.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/inbox`: the asks (Needs you, Resolved) and the Decisions
/// journal beside them.
///
/// [initialSegment] is the `?segment=` the location carries (a Home link opens
/// Decisions with it). The segment control changes it and [onSegment] reports
/// each change so the route can keep it in the URL.
///
/// Search starts hidden: the navbar search icon reveals it, and it applies to
/// every ask segment. A pull-down is a refresh and starts the list over from
/// its first page.
///
/// The ask segments show every ask, built lazily a page at a time;
/// [pageLoader] is the seam for a server-backed page (see [InboxPageLoader]).
class MastermindInboxPage extends StatefulWidget {
  const MastermindInboxPage({
    this.initialSegment,
    this.onSegment,
    this.pageLoader,
    super.key,
  });

  /// Null opens the default segment (Chat while Iris is on).
  final InboxSegment? initialSegment;
  final ValueChanged<InboxSegment>? onSegment;
  final InboxPageLoader? pageLoader;

  @override
  State<MastermindInboxPage> createState() => _MastermindInboxPageState();
}

class _MastermindInboxPageState extends State<MastermindInboxPage> {
  final _search = MastermindSearchController();
  String _query = '';
  Product? _product;
  late InboxSegment _segment = widget.initialSegment ?? defaultInboxSegment;
  late final InboxPagingController _paging = InboxPagingController(
    loader: widget.pageLoader,
  );
  Product? _decisionProduct;
  bool? _decisionReversible;

  @override
  void didUpdateWidget(MastermindInboxPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Another Home link, or the URL a segment change wrote, while this page is
    // already open.
    if (oldWidget.initialSegment != widget.initialSegment) {
      _segment = widget.initialSegment ?? defaultInboxSegment;
      _paging.reset();
    }
  }

  @override
  void initState() {
    super.initState();
    mastermindIrisCapability.addListener(_irisChanged);
  }

  /// The hub turned Iris on or off while the page is open: the segment bar
  /// follows, and an open Chat falls back to the default segment.
  void _irisChanged() {
    if (!mounted) return;
    setState(() {
      if (!availableInboxSegments.contains(_segment)) {
        _segment = defaultInboxSegment;
      }
    });
  }

  @override
  void dispose() {
    mastermindIrisCapability.removeListener(_irisChanged);
    _search.dispose();
    _paging.dispose();
    super.dispose();
  }

  void _selectSegment(InboxSegment value) {
    _paging.reset();
    setState(() => _segment = value);
    widget.onSegment?.call(value);
  }

  void _clearFilters() {
    _search.collapse();
    _paging.reset();
    setState(() {
      _query = '';
      _product = null;
    });
  }

  @override
  Widget build(BuildContext context) => MastermindSection(
    onRefresh: _paging.reset,
    builder: (context, ready, freshness) =>
        BlocBuilder<
          MastermindAnsweredElsewhereCubit,
          Map<String, AnsweredElsewhere>
        >(
          bloc: MastermindRepliesWatcher.answeredOf(context),
          builder: (context, lingering) {
            if (_segment == InboxSegment.chat) {
              return _chat(context, ready.snapshot, freshness);
            }
            final asks = _segment.listsAsks;
            final model = asks
                ? _askModel(ready.snapshot, lingering.values)
                : null;
            final list = AppPageScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: MastermindFreshnessStrip(freshness: freshness),
                ),
                SliverList.list(
                  children: [
                    if (asks)
                      MastermindCollapsibleSearch(
                        controller: _search,
                        placeholder:
                            context.l10n.mastermindInboxSearchPlaceholder,
                        onChanged: (value) {
                          _paging.reset();
                          setState(() => _query = value);
                        },
                      ),
                    InboxSegmentBar(
                      selected: _segment,
                      onChanged: _selectSegment,
                    ),
                    if (model != null) ..._askHeader(model, ready.snapshot),
                    if (_segment == InboxSegment.decisions)
                      _decisions(ready.snapshot),
                  ],
                ),
                if (model != null)
                  InboxListBody(
                    model: model,
                    paging: _paging,
                    onClearFilters: _clearFilters,
                    now: freshness.time.add(freshness.age),
                  ),
              ],
            );
            return MastermindRepliesWatcher(
              // Keep the navbar action mounted when lazy rows scroll away.
              child: Column(
                children: [
                  Expanded(child: list),
                  if (asks) _SearchAction(controller: _search),
                ],
              ),
            );
          },
        ),
  );

  /// Chat: the Iris feed, with the segment bar and "What needs me" above the
  /// oldest message. The composer lives in the shell dock.
  Widget _chat(
    BuildContext context,
    MastermindSnapshot snapshot,
    MastermindFreshness freshness,
  ) => MastermindRepliesWatcher(
    child: Column(
      children: [
        Expanded(
          child: IrisChatView(
            relay: context.read<MastermindRuntime>().iris,
            leading: (summary) => [
              MastermindFreshnessStrip(freshness: freshness),
              InboxSegmentBar(selected: _segment, onChanged: _selectSegment),
              InboxWhatNeedsMe(open: openAsks(snapshot), summary: summary),
            ],
          ),
        ),
        ShellChromeActions(
          ownerId: 'mastermind-inbox-chat',
          locations: const {Routes.mastermindInbox},
          actions: [
            ShellActionSpec(
              id: 'mastermind-iris-devices',
              icon: LucideIcons.smartphone,
              tooltip: context.l10n.mastermindIrisDevicesAction,
              onPressed: () =>
                  unawaited(context.push<void>(Routes.mastermindIrisDevices)),
            ),
          ],
        ),
      ],
    ),
  );

  MastermindInboxModel _askModel(
    MastermindSnapshot snapshot,
    Iterable<AnsweredElsewhere> lingering,
  ) {
    var model = MastermindInboxModel.from(
      snapshot,
      segment: _segment,
      query: _query,
      product: _product,
      answeredElsewhere: lingering,
    );
    // The chips only exist while two products are present: a filter whose
    // chip is gone could never be cleared and would strand the list.
    if (_product != null &&
        (model.products.length < 2 || !model.products.contains(_product))) {
      _product = null;
      model = MastermindInboxModel.from(
        snapshot,
        segment: _segment,
        query: _query,
        answeredElsewhere: lingering,
      );
    }
    return model;
  }

  List<Widget> _askHeader(
    MastermindInboxModel model,
    MastermindSnapshot snapshot,
  ) => [
    if (_segment == InboxSegment.needsYou)
      InboxWhatNeedsMe(open: openAsks(snapshot)),
    if (_segment != InboxSegment.resolved) const PendingRepliesSection(),
    if (model.products.length > 1)
      InboxFilters(
        products: model.products,
        selected: _product,
        onProduct: (value) {
          _paging.reset();
          setState(() => _product = value);
        },
      ),
  ];

  Widget _decisions(MastermindSnapshot snapshot) {
    var model = MastermindDecisionsModel.from(
      snapshot,
      product: _decisionProduct,
      reversible: _decisionReversible,
    );
    // A chip only exists while it can split the journal: a filter whose chip
    // is gone could never be cleared and would strand the list.
    final productGone =
        _decisionProduct != null &&
        (model.products.length < 2 ||
            !model.products.contains(_decisionProduct));
    final reversibleGone =
        _decisionReversible != null && !model.hasReversibleChoice;
    if (productGone || reversibleGone) {
      if (productGone) _decisionProduct = null;
      if (reversibleGone) _decisionReversible = null;
      model = MastermindDecisionsModel.from(
        snapshot,
        product: _decisionProduct,
        reversible: _decisionReversible,
      );
    }
    return DecisionsBody(
      model: model,
      product: _decisionProduct,
      reversible: _decisionReversible,
      onProduct: (value) => setState(() => _decisionProduct = value),
      onReversible: (value) => setState(() => _decisionReversible = value),
    );
  }
}

/// The navbar search icon: opens and focuses the field, or clears and
/// closes it.
class _SearchAction extends StatelessWidget {
  const _SearchAction({required this.controller});

  final MastermindSearchController controller;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) => ShellChromeActions(
      ownerId: 'mastermind-inbox',
      locations: const {Routes.mastermindInbox},
      actions: [
        controller.searchActionSpec(
          id: 'mastermind-inbox-search',
          tooltip: context.l10n.mastermindInboxSearchAction,
        ),
      ],
    ),
  );
}
