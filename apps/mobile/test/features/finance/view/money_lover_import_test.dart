import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/finance/utils/money_lover_import.dart';

void main() {
  test('reads escaped quotes and multiline notes from a Money Lover file', () {
    final bytes = utf8.encode(
      'id,date,category,amount,currency,note,wallet\r\n'
      '1,10/11/2026,Groceries,-15.5,USD,"First, then ""second""\nline",Cash\r\n',
    );
    final rows = parseMoneyLoverFile(bytes, ',');
    expect(rows.single['amount'], '-15.5');
    expect(rows.single['note'], 'First, then "second"\nline');
    expect(rows.single['wallet'], 'Cash');
  });

  test('rejects rows whose dates would otherwise roll into another month', () {
    final bytes = utf8.encode(
      'id,date,category,amount,currency,note,wallet\n'
      '1,31/02/2026,Groceries,-10,USD,,Cash\n',
    );
    expect(() => parseMoneyLoverFile(bytes, ','), throwsFormatException);
  });
}
