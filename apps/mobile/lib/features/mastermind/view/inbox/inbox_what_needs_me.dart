import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/what_needs_me.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/inbox/use_recommendations_sheet.dart';
import 'package:mobile/features/mastermind/view/inbox/what_needs_me_header.dart';

/// [WhatNeedsMeHeader] bound to the reply outbox: "Use recommendations"
/// shows only while replies are on and some open ask has a recommendation
/// this device has not answered yet.
class InboxWhatNeedsMe extends StatelessWidget {
  const InboxWhatNeedsMe({required this.open, this.summary, super.key});

  final List<NeedsYou> open;
  final IrisSummary? summary;

  @override
  Widget build(BuildContext context) {
    final replies = MastermindRepliesWatcher.cubitOf(context);
    return BlocBuilder<MastermindRepliesCubit, MastermindRepliesState>(
      bloc: replies,
      builder: (context, state) {
        final recommendable = state.canReply && state.loaded
            ? recommendableAsks(open, state)
            : const <NeedsYou>[];
        return WhatNeedsMeHeader(
          counts: WhatNeedsMeCounts.from(open),
          summary: summary,
          onUseRecommendations: recommendable.isEmpty
              ? null
              : () => unawaited(
                  showUseRecommendationsSheet(
                    context,
                    items: recommendable,
                    replies: replies,
                  ),
                ),
        );
      },
    );
  }
}
