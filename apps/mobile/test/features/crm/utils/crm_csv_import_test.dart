import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/crm/utils/crm_csv_import.dart';

void main() {
  test('previews valid rows and reports invalid and duplicate addresses', () {
    final result = parseCrmImportRows(
      '\ufeffFull Name,Email\r\n'
      '"Example, Sam",SAM@example.com\r\n'
      'Duplicate,sam@example.com\r\n'
      'Invalid,not-an-address\r\n',
    );
    expect(result.rows, [
      {'fullName': 'Example, Sam', 'email': 'sam@example.com'},
    ]);
    expect(result.skipped, 2);
  });

  test('does not accept a truncated quoted field', () {
    expect(
      () => parseCrmImportRows('email,full_name\nx@example.com,"unfinished'),
      throwsFormatException,
    );
  });
}
