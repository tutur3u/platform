import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/utils/tiptap_description_parser.dart';

void main() {
  group('parseTipTapTaskDescription', () {
    test('returns null for empty input', () {
      expect(parseTipTapTaskDescription(null), isNull);
      expect(parseTipTapTaskDescription('   '), isNull);
    });

    test('returns raw text for plain description', () {
      final parsed = parseTipTapTaskDescription('hello world');

      expect(parsed, isNotNull);
      expect(parsed!.markdown, 'hello world');
      expect(parsed.plainText, 'hello world');
      expect(parsed.hasContent, isTrue);
    });

    test('parses heading, paragraph, bullet list and task list', () {
      final json = jsonEncode({
        'type': 'doc',
        'content': [
          {
            'type': 'heading',
            'attrs': {'level': 2},
            'content': [
              {'type': 'text', 'text': 'Plan'},
            ],
          },
          {
            'type': 'paragraph',
            'content': [
              {'type': 'text', 'text': 'Ship it'},
            ],
          },
          {
            'type': 'bulletList',
            'content': [
              {
                'type': 'listItem',
                'content': [
                  {
                    'type': 'paragraph',
                    'content': [
                      {'type': 'text', 'text': 'One'},
                    ],
                  },
                ],
              },
              {
                'type': 'listItem',
                'content': [
                  {
                    'type': 'paragraph',
                    'content': [
                      {'type': 'text', 'text': 'Two'},
                    ],
                  },
                ],
              },
            ],
          },
          {
            'type': 'taskList',
            'content': [
              {
                'type': 'taskItem',
                'attrs': {'checked': false},
                'content': [
                  {
                    'type': 'paragraph',
                    'content': [
                      {'type': 'text', 'text': 'Todo'},
                    ],
                  },
                ],
              },
              {
                'type': 'taskItem',
                'attrs': {'checked': true},
                'content': [
                  {
                    'type': 'paragraph',
                    'content': [
                      {'type': 'text', 'text': 'Done'},
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      final parsed = parseTipTapTaskDescription(json)!;

      expect(parsed.markdown, contains('## Plan'));
      expect(parsed.markdown, contains('Ship it'));
      expect(parsed.markdown, contains('- One'));
      expect(parsed.markdown, contains('- Two'));
      expect(parsed.markdown, contains('- [ ] Todo'));
      expect(parsed.markdown, contains('- [x] Done'));

      expect(parsed.plainText, contains('Plan'));
      expect(parsed.plainText, contains('Ship it'));
      expect(parsed.plainText, contains('• One'));
      expect(parsed.plainText, contains('[ ] Todo'));
      expect(parsed.plainText, contains('[x] Done'));
    });

    test('parses marks and mention', () {
      final json = jsonEncode({
        'type': 'doc',
        'content': [
          {
            'type': 'paragraph',
            'content': [
              {'type': 'text', 'text': 'Hi '},
              {
                'type': 'text',
                'text': 'there',
                'marks': [
                  {'type': 'bold'},
                  {'type': 'italic'},
                ],
              },
              {'type': 'text', 'text': ' '},
              {
                'type': 'mention',
                'attrs': {'displayName': 'Alex'},
              },
              {'type': 'text', 'text': ' '},
              {
                'type': 'text',
                'text': 'site',
                'marks': [
                  {
                    'type': 'link',
                    'attrs': {'href': 'https://example.com'},
                  },
                ],
              },
            ],
          },
        ],
      });

      final parsed = parseTipTapTaskDescription(json)!;

      expect(parsed.markdown, contains('_**there**_'));
      expect(parsed.markdown, contains('@@mention:0@@'));
      expect(parsed.markdown, contains('[site](https://example.com)'));
      expect(parsed.plainText, contains('Hi there @Alex site'));
      expect(parsed.mentions, hasLength(1));
      expect(parsed.mentions.first.displayName, 'Alex');
    });

    test('parses code block and table', () {
      final json = jsonEncode({
        'type': 'doc',
        'content': [
          {
            'type': 'codeBlock',
            'attrs': {'language': 'ts'},
            'content': [
              {'type': 'text', 'text': 'const x = 1;'},
            ],
          },
          {
            'type': 'table',
            'content': [
              {
                'type': 'tableRow',
                'content': [
                  {
                    'type': 'tableHeader',
                    'content': [
                      {
                        'type': 'paragraph',
                        'content': [
                          {'type': 'text', 'text': 'A'},
                        ],
                      },
                    ],
                  },
                  {
                    'type': 'tableHeader',
                    'content': [
                      {
                        'type': 'paragraph',
                        'content': [
                          {'type': 'text', 'text': 'B'},
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                'type': 'tableRow',
                'content': [
                  {
                    'type': 'tableCell',
                    'content': [
                      {
                        'type': 'paragraph',
                        'content': [
                          {'type': 'text', 'text': '1'},
                        ],
                      },
                    ],
                  },
                  {
                    'type': 'tableCell',
                    'content': [
                      {
                        'type': 'paragraph',
                        'content': [
                          {'type': 'text', 'text': '2'},
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      final parsed = parseTipTapTaskDescription(json)!;

      expect(parsed.markdown, contains('```ts'));
      expect(parsed.markdown, contains('const x = 1;'));
      expect(parsed.markdown, contains('| A | B |'));
      expect(parsed.markdown, contains('| --- | --- |'));
      expect(parsed.markdown, contains('| 1 | 2 |'));
      expect(parsed.plainText, contains('const x = 1;'));
      expect(parsed.plainText, contains('| A | B |'));
    });

    test('falls back to raw text when invalid JSON', () {
      const raw = '{not valid json';
      final parsed = parseTipTapTaskDescription(raw)!;

      expect(parsed.markdown, raw);
      expect(parsed.plainText, raw);
    });
  });
}
