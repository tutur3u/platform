import 'dart:convert';

typedef FinanceImportResult = ({int imported, int total, int errors});

const moneyLoverMaximumRows = 10000;
const int moneyLoverMaximumBytes = 5 * 1024 * 1024;

List<Map<String, String>> parseMoneyLoverFile(
  List<int> bytes,
  String delimiter,
) {
  if (bytes.length > moneyLoverMaximumBytes) {
    throw const FormatException('Money Lover file exceeds the size limit.');
  }
  final text = utf8.decode(bytes).replaceFirst(RegExp(r'^\uFEFF'), '');
  final records = <List<String>>[];
  var record = <String>[];
  final cell = StringBuffer();
  var quoted = false;
  var closedQuote = false;

  void field() {
    record.add(cell.toString().trim());
    cell.clear();
    closedQuote = false;
  }

  void endRow() {
    field();
    if (record.any((value) => value.isNotEmpty)) records.add(record);
    if (records.length > moneyLoverMaximumRows + 1) {
      throw const FormatException('Money Lover file exceeds the row limit.');
    }
    record = [];
  }

  for (var i = 0; i < text.length; i++) {
    final char = text[i];
    if (quoted) {
      if (char != '"') {
        cell.write(char);
      } else if (i + 1 < text.length && text[i + 1] == '"') {
        cell.write('"');
        i++;
      } else {
        quoted = false;
        closedQuote = true;
      }
    } else if (char == delimiter) {
      field();
    } else if (char == '\r' || char == '\n') {
      endRow();
      if (char == '\r' && i + 1 < text.length && text[i + 1] == '\n') i++;
    } else if (char == '"' && cell.isEmpty && !closedQuote) {
      quoted = true;
    } else if (closedQuote && char != ' ') {
      throw const FormatException('Unexpected content after closing quote.');
    } else if (!closedQuote) {
      cell.write(char);
    }
  }
  if (quoted) throw const FormatException('Unclosed quoted field.');
  if (record.isNotEmpty || cell.isNotEmpty || closedQuote) endRow();
  if (records.length < 2 || records.first.length != 7) {
    throw const FormatException('Expected a header and seven columns.');
  }

  const keys = [
    'id',
    'date',
    'category',
    'amount',
    'currency',
    'note',
    'wallet',
  ];
  return records
      .skip(1)
      .map((columns) {
        if (columns.length != keys.length ||
            !_validDate(columns[1]) ||
            columns[2].isEmpty ||
            double.tryParse(columns[3])?.isFinite != true ||
            !RegExp(r'^[A-Za-z]{3}$').hasMatch(columns[4]) ||
            columns[6].isEmpty) {
          throw const FormatException('Invalid Money Lover transaction row.');
        }
        return Map.fromIterables(keys, columns);
      })
      .toList(growable: false);
}

bool _validDate(String value) {
  final parts = value.split('/').map(int.tryParse).toList();
  if (parts.length != 3 || parts.any((part) => part == null)) return false;
  final day = parts[0]!;
  final month = parts[1]!;
  final year = parts[2]!;
  if (year < 1000 || year > 9999) return false;
  final parsed = DateTime.utc(year, month, day);
  return parsed.year == year && parsed.month == month && parsed.day == day;
}
