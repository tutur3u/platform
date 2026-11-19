import 'package:intl/intl.dart';

enum RecurringFrequency { daily, weekly, monthly, yearly }

typedef RecurringTransactionDraft = ({
  String name,
  String? description,
  double amount,
  String walletId,
  String? categoryId,
  RecurringFrequency frequency,
  DateTime startDate,
  DateTime? endDate,
});

class RecurringTransaction {
  const RecurringTransaction({
    required this.id,
    required this.draft,
    required this.nextOccurrence,
    required this.active,
  });

  factory RecurringTransaction.fromJson(Map<String, dynamic> json) =>
      RecurringTransaction(
        id: json['id'] as String,
        draft: (
          name: json['name'] as String,
          description: json['description'] as String?,
          amount: (json['amount'] as num).toDouble(),
          walletId: json['wallet_id'] as String,
          categoryId: json['category_id'] as String?,
          frequency: RecurringFrequency.values.byName(
            json['frequency'] as String,
          ),
          startDate: DateTime.parse(json['start_date'] as String),
          endDate: DateTime.tryParse(json['end_date'] as String? ?? ''),
        ),
        nextOccurrence: DateTime.parse(json['next_occurrence'] as String),
        active: json['is_active'] as bool,
      );

  final String id;
  final RecurringTransactionDraft draft;
  final DateTime nextOccurrence;
  final bool active;

  static Map<String, dynamic> payload(RecurringTransactionDraft draft) {
    final format = DateFormat('yyyy-MM-dd', 'en');
    return {
      'name': draft.name,
      'description': draft.description,
      'amount': draft.amount,
      'wallet_id': draft.walletId,
      'category_id': draft.categoryId,
      'frequency': draft.frequency.name,
      'start_date': format.format(draft.startDate),
      'end_date': draft.endDate == null ? null : format.format(draft.endDate!),
    };
  }
}
