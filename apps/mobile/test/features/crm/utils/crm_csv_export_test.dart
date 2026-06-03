import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/crm/utils/crm_csv_export.dart';

void main() {
  group('escapeCrmCsvCell', () {
    test('quotes empty and ordinary values', () {
      expect(escapeCrmCsvCell(null), '""');
      expect(escapeCrmCsvCell('Ada Lovelace'), '"Ada Lovelace"');
    });

    test('escapes embedded quotes', () {
      expect(escapeCrmCsvCell('Ada "Countess"'), '"Ada ""Countess"""');
    });

    test('prefixes spreadsheet formula values with an apostrophe', () {
      expect(
        escapeCrmCsvCell('=HYPERLINK("https://attacker.example")'),
        '"\'=HYPERLINK(""https://attacker.example"")"',
      );

      const dangerousValues = [
        '=HYPERLINK("https://attacker.example")',
        '+SUM(1,2)',
        '-IMPORTXML("https://attacker.example","//a")',
        '@SUM(1,2)',
        ' \t=WEBSERVICE("https://attacker.example")',
      ];

      for (final value in dangerousValues) {
        expect(escapeCrmCsvCell(value), startsWith('"\''));
      }
    });
  });
}
