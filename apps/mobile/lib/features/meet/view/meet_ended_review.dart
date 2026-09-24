import 'package:flutter/material.dart';
import 'package:mobile/features/meet/view/meet_review_transcript.dart';
import 'package:mobile/l10n/l10n.dart';

class MeetEndedReview extends StatelessWidget {
  const MeetEndedReview({
    required this.review,
    required this.onRefresh,
    super.key,
  });

  final Map<String, dynamic> review;
  final VoidCallback onRefresh;

  static List<Map<String, dynamic>> _rows(Object? value) => value is List
      ? value.whereType<Map<String, dynamic>>().toList(growable: false)
      : const [];

  static String? _text(Object? value) {
    final text = value?.toString().trim();
    return text == null || text.isEmpty ? null : text;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final canReadNotes = review['canReadNotes'] == true;
    final sessions = _rows(review['sessions']);
    final chunks = _rows(review['chunks']);
    final costs = review['costs'] is Map<String, dynamic>
        ? review['costs'] as Map<String, dynamic>
        : null;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        Icon(
          Icons.call_end_outlined,
          size: 42,
          color: Theme.of(context).colorScheme.primary,
        ),
        const SizedBox(height: 12),
        Text(
          l10n.meetCallEnded,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        Text(
          canReadNotes ? l10n.meetReviewHint : l10n.meetReviewPrivate,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: onRefresh,
          icon: const Icon(Icons.refresh_rounded),
          label: Text(l10n.commonRefresh),
        ),
        if (canReadNotes) ...[
          const SizedBox(height: 18),
          Text(
            l10n.meetReviewNotes,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          if (!sessions.any((session) => session['notes'] != null))
            Text(l10n.meetReviewNoNotes),
          for (var index = 0; index < sessions.length; index++)
            if (sessions[index]['notes'] case final Map<String, dynamic> notes)
              Card(
                child: ExpansionTile(
                  initiallyExpanded: index == sessions.length - 1,
                  title: Text('${l10n.meetReviewNotes} ${index + 1}'),
                  childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  children: [
                    if (_text(notes['summary']) case final summary?)
                      Align(
                        alignment: Alignment.centerLeft,
                        child: SelectableText(summary),
                      ),
                    for (final field in [
                      'decisions',
                      'actionItems',
                      'openQuestions',
                    ])
                      if (notes[field] case final List<dynamic> items)
                        for (final item in items)
                          if (_text(item is Map ? item['task'] : item)
                              case final text?)
                            ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              leading: const Icon(
                                Icons.check_circle_outline,
                                size: 18,
                              ),
                              title: SelectableText(text),
                            ),
                  ],
                ),
              ),
          const SizedBox(height: 18),
          Text(
            l10n.meetReviewTranscript,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          MeetReviewTranscript(chunks: chunks),
        ],
        if (costs != null) ...[
          const SizedBox(height: 18),
          Text(
            l10n.meetEstimatedCosts,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          _costRow(
            context,
            l10n.meetReviewTranscriptionCost,
            costs['transcriptionCostUsd'],
          ),
          _costRow(context, l10n.meetReviewNotesCost, costs['notesCostUsd']),
          const Divider(),
          _costRow(context, l10n.meetReviewTotalCost, costs['totalCostUsd']),
          if ((costs['unpricedRequests'] as num? ?? 0) > 0)
            Text(l10n.meetReviewUnpriced),
        ],
      ],
    );
  }

  Widget _costRow(BuildContext context, String label, Object? value) {
    final amount = value is num ? value.toDouble() : 0.0;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label)),
          Text('\$${amount.toStringAsFixed(4)}'),
        ],
      ),
    );
  }
}
