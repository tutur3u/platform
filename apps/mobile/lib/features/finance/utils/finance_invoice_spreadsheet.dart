import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';

enum InvoiceSpreadsheetFormat {
  spreadsheet(
    'xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ),
  csv('csv', 'text/csv');

  const InvoiceSpreadsheetFormat(this.extension, this.mimeType);

  final String extension;
  final String mimeType;
}

typedef InvoiceSpreadsheet = ({
  InvoiceSpreadsheetFormat format,
  List<List<Object?>> rows,
});

Uint8List encodeInvoiceSpreadsheet(
  InvoiceSpreadsheet input,
) => switch (input.format) {
  InvoiceSpreadsheetFormat.csv => Uint8List.fromList(
    utf8.encode(
      '\uFEFF${input.rows.map((row) => row.map(_csv).join(',')).join('\r\n')}',
    ),
  ),
  InvoiceSpreadsheetFormat.spreadsheet => _workbook(input.rows),
};

String _csv(Object? value) {
  final text = value?.toString() ?? '';
  final first = text.trimLeft();
  final escape =
      value is String &&
      (first.isNotEmpty && '=+-@'.contains(first[0]) ||
          text.startsWith('\r') ||
          text.startsWith('\n') ||
          text.startsWith('\t'));
  return '"${escape ? "'" : ''}${text.replaceAll('"', '""')}"';
}

Uint8List _workbook(List<List<Object?>> rows) {
  final sheet = StringBuffer()
    ..write('<worksheet xmlns="$_spreadsheet"><sheetData>');
  for (final row in rows) {
    sheet.write('<row>');
    for (final cell in row) {
      if (cell is num && cell.isFinite) {
        sheet.write('<c><v>$cell</v></c>');
      } else {
        final text = (cell?.toString() ?? '').replaceAll(_controls, '');
        sheet
          ..write('<c t="inlineStr"><is><t xml:space="preserve">')
          ..write(const HtmlEscape().convert(text))
          ..write('</t></is></c>');
      }
    }
    sheet.write('</row>');
  }
  sheet.write('</sheetData></worksheet>');
  final archive = Archive();
  for (final file in {
    '[Content_Types].xml': _contentTypes,
    '_rels/.rels': _rootRelationships,
    'xl/workbook.xml': _book,
    'xl/_rels/workbook.xml.rels': _bookRelationships,
    'xl/worksheets/invoices.xml': sheet.toString(),
  }.entries) {
    archive.addFile(ArchiveFile.string(file.key, file.value));
  }
  return ZipEncoder().encodeBytes(archive);
}

final _controls = RegExp(r'[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]');
const _spreadsheet =
    'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const _relationships =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const _package = 'http://schemas.openxmlformats.org/package/2006';

const _officeMime = 'application/vnd.openxmlformats-officedocument';
const _packageMime = 'application/vnd.openxmlformats-package';

const _contentTypes =
    '''
<Types xmlns="$_package/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="$_packageMime.relationships+xml"/>
  <Override PartName="/xl/workbook.xml"
    ContentType="$_officeMime.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/invoices.xml"
    ContentType="$_officeMime.spreadsheetml.worksheet+xml"/>
</Types>
''';

const _rootRelationships =
    '''
<Relationships xmlns="$_package/relationships">
  <Relationship Id="rId1" Type="$_relationships/officeDocument"
    Target="xl/workbook.xml"/>
</Relationships>
''';

const _book =
    '''
<workbook xmlns="$_spreadsheet" xmlns:r="$_relationships">
  <sheets><sheet name="Invoices" sheetId="1" r:id="rId1"/></sheets>
</workbook>
''';

const _bookRelationships =
    '''
<Relationships xmlns="$_package/relationships">
  <Relationship Id="rId1" Type="$_relationships/worksheet"
    Target="worksheets/invoices.xml"/>
</Relationships>
''';
