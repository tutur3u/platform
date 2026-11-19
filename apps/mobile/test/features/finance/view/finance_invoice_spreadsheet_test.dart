import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/finance/utils/finance_invoice_spreadsheet.dart';

void main() {
  const rows = <List<Object?>>[
    ['title', 'amount'],
    ['=HYPERLINK("https://example.test") <>&', -55.5],
  ];

  test('CSV keeps numeric amounts and escapes spreadsheet formula text', () {
    final csv = utf8.decode(
      encodeInvoiceSpreadsheet((
        format: InvoiceSpreadsheetFormat.csv,
        rows: rows,
      )),
    );
    expect(csv, contains('"title","amount"'));
    expect(csv, contains('''"'=HYPERLINK(""https://example.test"")'''));
    expect(csv, contains(',"-55.5"'));
  });

  test('Excel uses typed numeric cells and literal XML-escaped text', () {
    final bytes = encodeInvoiceSpreadsheet((
      format: InvoiceSpreadsheetFormat.spreadsheet,
      rows: rows,
    ));
    final archive = ZipDecoder().decodeBytes(bytes);
    expect(archive.findFile('xl/workbook.xml'), isNotNull);
    final invoice = archive.findFile('xl/worksheets/invoices.xml')!;
    final sheet = utf8.decode(invoice.content);
    expect(sheet, contains('<v>-55.5</v>'));
    expect(sheet, contains('t="inlineStr"'));
    expect(sheet, contains('&lt;&gt;&amp;'));
    expect(sheet, isNot(contains('<f>')));
  });
}
