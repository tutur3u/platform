import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/bridge/assistant_screen_context.dart';
import 'package:mobile/features/assistant/models/assistant_mobile_screen_context.dart';

/// A closure field, which cannot inspect a rendered control.
AssistantFormFieldContext _field(
  String key,
  String value, {
  String? label,
  bool obscured = false,
  String type = 'text',
}) => AssistantFormFieldContext(
  key: key,
  label: label ?? key,
  value: () => value,
  obscured: obscured,
  type: type,
);

/// A text field whose rendered control is a plain, unobscured text input.
AssistantFormFieldContext _text(String key, String value, {String? label}) =>
    AssistantFormFieldContext.text(
      key: key,
      label: label ?? key,
      controller: TextEditingController(text: value),
    );

AssistantFieldControl? _plainControl(TextEditingController _) =>
    const AssistantFieldControl(
      obscureText: false,
      keyboardType: TextInputType.text,
    );

Map<String, dynamic> _values(List<AssistantFormFieldContext> fields) {
  final registry = AssistantScreenContextRegistry.instance
    ..register(
      Object(),
      AssistantScreenContextEntry(fields: fields),
      lookupControl: _plainControl,
    );
  return {
    for (final field
        in ((registry.snapshot()['form'] as Map)['fields'] as List)
            .cast<Map<String, dynamic>>())
      field['key'] as String: field['value'],
  };
}

void main() {
  final registry = AssistantScreenContextRegistry.instance;
  tearDown(registry.clear);

  test('redacts obscured and sensitive fields', () {
    final values = _values([
      _text('title', 'Dentist'),
      _field('pw', 'hunter2', obscured: true),
      _field('confirm', 'hunter2', type: 'password'),
      _text('cardNumber', '4242 4242'),
      _text('note', 'x', label: 'One-time PIN'),
      _text('apiKey', 'sk-test'),
    ]);
    expect(values['title'], 'Dentist');
    for (final key in ['pw', 'confirm', 'cardNumber', 'note', 'apiKey']) {
      expect(values[key], redactedFieldValue, reason: key);
    }
  });

  test('bounds records, fields and values', () {
    registry.register(
      Object(),
      AssistantScreenContextEntry(
        entities: [
          for (var i = 0; i < 25; i++)
            AssistantScreenEntity(type: 'task', id: 'id-$i'),
        ],
        fields: [for (var i = 0; i < 35; i++) _text('f$i', 'v' * 600)],
      ),
      lookupControl: _plainControl,
    );
    final snapshot = registry.snapshot();
    expect(snapshot['visibleRecords'], hasLength(20));
    final fields = (snapshot['form'] as Map)['fields'] as List<dynamic>;
    expect(fields, hasLength(30));
    expect((fields.first as Map)['value'], hasLength(501));
  });

  test('uses the latest visible registration and stops after unregister', () {
    final unregisterFirst = registry.register(
      Object(),
      const AssistantScreenContextEntry(
        entities: [AssistantScreenEntity(type: 'task', id: 'first')],
      ),
    );
    var hidden = true;
    registry.register(
      Object(),
      const AssistantScreenContextEntry(
        entities: [AssistantScreenEntity(type: 'task', id: 'offstage')],
      ),
      isVisible: () => !hidden,
    );
    expect(registry.snapshot()['visibleRecords'], [
      {'type': 'task', 'id': 'first'},
    ]);
    hidden = false;
    expect(registry.snapshot()['visibleRecords'], [
      {'type': 'task', 'id': 'offstage'},
    ]);
    hidden = true;
    unregisterFirst();
    expect(registry.snapshot(), isEmpty);
  });

  test('field values are read only when a snapshot is taken', () {
    var reads = 0;
    registry.register(
      Object(),
      AssistantScreenContextEntry(
        fields: [
          AssistantFormFieldContext(
            key: 'title',
            label: 'Title',
            value: () {
              reads++;
              return 'Draft';
            },
          ),
        ],
      ),
    );
    expect(reads, 0);
    registry.snapshot();
    expect(reads, 1);
  });

  test('screen context merges the route with the foreground screen', () {
    registry.register(
      Object(),
      AssistantScreenContextEntry(
        entities: const [
          AssistantScreenEntity(type: 'calendar_event', id: 'event-1'),
        ],
        fields: [_text('title', 'Standup')],
      ),
      lookupControl: _plainControl,
    );
    expect(assistantMobileScreenContext(Uri.parse('/calendar')), {
      'screen': 'calendar',
      'visibleRecords': [
        {'type': 'calendar_event', 'id': 'event-1'},
      ],
      'form': {
        'fields': [
          {
            'key': 'title',
            'label': 'title',
            'type': 'text',
            'value': 'Standup',
          },
        ],
      },
    });
  });

  testWidgets('scope registers while visible and leaves on dispose', (
    tester,
  ) async {
    const entry = AssistantScreenContextEntry(
      entities: [AssistantScreenEntity(type: 'wallet', id: 'w-1')],
    );
    Widget host({required bool enabled, required bool mounted}) => TickerMode(
      enabled: enabled,
      child: mounted
          ? const AssistantScreenContextScope(entry: entry, child: SizedBox())
          : const SizedBox(),
    );

    await tester.pumpWidget(host(enabled: true, mounted: true));
    expect(registry.snapshot()['visibleRecords'], isNotNull);
    await tester.pumpWidget(host(enabled: false, mounted: true));
    expect(registry.snapshot(), isEmpty);
    await tester.pumpWidget(host(enabled: true, mounted: false));
    expect(registry.snapshot(), isEmpty);
  });

  test('normalizes sensitive input types such as visiblePassword', () {
    registry.register(
      Object(),
      AssistantScreenContextEntry(
        fields: [
          _field('nickname', 'hunter2', type: 'visiblePassword'),
          _field('alias', 'hunter2', type: 'visible_password'),
        ],
      ),
    );
    final fields = (registry.snapshot()['form'] as Map)['fields'] as List;
    expect(fields.map((f) => (f as Map)['value']), [
      redactedFieldValue,
      redactedFieldValue,
    ]);
  });

  test('redacts the whole field holding a secret under a misleading name', () {
    final values = _values([
      _text(
        'notes',
        'Standup. API key sk-proj-abcdefghijklmnop1234, card '
            '4111 1111 1111 1111.',
        label: 'Description',
      ),
      _text('title', 'Standup'),
    ]);
    expect(values['notes'], redactedFieldValue);
    expect(values['title'], 'Standup');
  });

  test('redacts normalized and encoded secrets in ordinary fields', () {
    final values = _values([
      _text('a', 'card 4242\t4242\t4242\t4242'),
      _text('b', 'card 4242\u00A04242\u00A04242\u00A04242'),
      _text('c', 'key sk-abcdefgh\u200Bijklmnop1234'),
      _text(
        'd',
        '%73%6B%2D%61%62%63%64%65%66%67%68%69%6A%6B%6C%6D%6E%6F%70'
            '%31%32%33%34',
      ),
    ]);
    for (final key in ['a', 'b', 'c', 'd']) {
      expect(values[key], redactedFieldValue, reason: key);
    }
  });

  test(
    'a secret split across two ordinary fields redacts every text field',
    () {
      for (final order in [
        ['sk-abcdefgh', 'ijklmnop1234'],
        ['ijklmnop1234', 'sk-abcdefgh'],
      ]) {
        AssistantScreenContextRegistry.instance.clear();
        final values = _values([
          _text('title', order[0]),
          _text('notes', 'Bring slides'),
          _text('description', order[1]),
          _field('all_day', 'false', type: 'boolean'),
        ]);
        expect(values['title'], redactedFieldValue, reason: '$order');
        expect(values['notes'], redactedFieldValue, reason: '$order');
        expect(values['description'], redactedFieldValue, reason: '$order');
        expect(values['all_day'], 'false', reason: '$order');
      }
    },
  );

  test('snapshot redacts compatibility and encoded non-ASCII secrets', () {
    final card = List.filled(
      4,
      String.fromCharCodes([0x664, 0x662, 0x664, 0x662]),
    ).join(' ');
    final percentCard = utf8
        .encode(card)
        .map((byte) => '%${byte.toRadixString(16).toUpperCase()}')
        .join();
    final values = _values([
      _text('a', '${String.fromCharCode(0x17F)}k-abcdefghijklmnop1234'),
      _text('b', 'card $percentCard'),
      _text('c', 'Họp nhóm lúc 9:30'),
    ]);
    expect(values['a'], redactedFieldValue);
    expect(values['b'], redactedFieldValue);
    expect(values['c'], 'Họp nhóm lúc 9:30');
  });

  test('snapshot folds ASCII compatibility symbols, raw and decoded', () {
    final rupee = String.fromCharCode(0x20A8);
    final split = 'sk-abcdefghijklmn${rupee}1234';
    final percent = utf8
        .encode(split)
        .map((byte) => '%${byte.toRadixString(16).padLeft(2, '0')}')
        .join();
    final values = _values([
      _text('raw', split),
      _text('encoded', 'see $percent'),
      _text('lunch', '${rupee}250 for lunch'),
    ]);
    expect(values['raw'], redactedFieldValue);
    expect(values['encoded'], redactedFieldValue);
    expect(values['lunch'], '${rupee}250 for lunch');
  });

  test('a split secret at the end of a bounded long field is redacted', () {
    for (final (first, second) in [
      ('${'a ' * 244} sk-abcdefgh${' a' * 4100}', 'ijklmnop1234'),
      ('${'a ' * 245}4242 4242 ${'a ' * 3000}', '4242 4242'),
    ]) {
      AssistantScreenContextRegistry.instance.clear();
      final values = _values([_text('title', first), _text('notes', second)]);
      expect(values['title'], redactedFieldValue, reason: second);
      expect(values['notes'], redactedFieldValue, reason: second);
    }
  });

  test('closure fields share only well-formed structured values', () {
    final values = _values([
      _field('all_day', 'true', type: 'boolean'),
      _field('start', '2026-10-25T09:00:00.000', type: 'datetime'),
      _field('day', '2026-10-25', type: 'date'),
      _field('at', '09:30', type: 'time'),
      _field('notes', 'Bring slides'),
      _field('flag', 'maybe', type: 'boolean'),
      _field('end', 'sk-abcdefghijklmnop1234', type: 'datetime'),
    ]);
    expect(values['all_day'], 'true');
    expect(values['start'], '2026-10-25T09:00:00.000');
    expect(values['day'], '2026-10-25');
    expect(values['at'], '09:30');
    for (final key in ['notes', 'flag', 'end']) {
      expect(values[key], redactedFieldValue, reason: key);
    }
  });

  testWidgets('a custom widget with its own controller fails closed', (
    tester,
  ) async {
    final registered = TextEditingController(text: 'Bring slides');
    final internal = TextEditingController(text: 'hunter2');
    addTearDown(registered.dispose);
    addTearDown(internal.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Material(
          child: AssistantScreenContextScope(
            entry: AssistantScreenContextEntry(
              fields: [
                AssistantFormFieldContext.text(
                  key: 'notes',
                  label: 'Notes',
                  controller: registered,
                ),
              ],
            ),
            child: TextField(controller: internal, obscureText: true),
          ),
        ),
      ),
    );
    final field =
        ((registry.snapshot()['form'] as Map)['fields'] as List).single as Map;
    expect(field['value'], redactedFieldValue);
  });

  testWidgets('reads obscuring and keyboard type from the rendered controls', (
    tester,
  ) async {
    final hidden = TextEditingController(text: 'hunter2');
    final visiblePassword = TextEditingController(text: 'hunter3');
    final notes = TextEditingController(text: 'Bring slides');
    addTearDown(hidden.dispose);
    addTearDown(visiblePassword.dispose);
    addTearDown(notes.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Material(
          child: AssistantScreenContextScope(
            entry: AssistantScreenContextEntry(
              fields: [
                // Misleading names: only the real controls reveal secrecy.
                AssistantFormFieldContext.text(
                  key: 'nickname',
                  label: 'Nickname',
                  controller: hidden,
                ),
                AssistantFormFieldContext.text(
                  key: 'title',
                  label: 'Title',
                  controller: visiblePassword,
                ),
                AssistantFormFieldContext.text(
                  key: 'notes',
                  label: 'Notes',
                  controller: notes,
                ),
              ],
            ),
            child: Column(
              children: [
                TextField(controller: hidden, obscureText: true),
                TextField(
                  controller: visiblePassword,
                  keyboardType: TextInputType.visiblePassword,
                ),
                TextField(controller: notes, maxLines: 3),
              ],
            ),
          ),
        ),
      ),
    );
    final fields = ((registry.snapshot()['form'] as Map)['fields'] as List)
        .cast<Map<String, dynamic>>();
    expect(fields[0]['value'], redactedFieldValue);
    expect(fields[1]['value'], redactedFieldValue);
    expect(fields[2]['value'], 'Bring slides');
    expect(fields[2]['type'], 'multiline');
  });
}
