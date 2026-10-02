import 'package:mobile/data/sources/inventory_sale_journal.dart';

class MemorySaleStore {
  final values = <String, String>{};
  bool failRead = false;
  bool failWrite = false;
  bool failConfirmation = false;
  bool corruptReadback = false;
  late final journal = InventorySaleJournal(
    read: (key) async {
      if (failRead) throw StateError('Storage read failure');
      final value = values[key];
      return corruptReadback && value != null ? 'corrupt' : value;
    },
    write: (key, value) async {
      if (failWrite || (failConfirmation && value.contains('"invoice_id"'))) {
        throw StateError('Storage write failure');
      }
      values[key] = value;
    },
    remove: (key) async => values.remove(key),
  );
}
