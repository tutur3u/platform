/// Round-trip fixtures for the documents editor.
library;

Map<String, dynamic> text(String value, [List<Map<String, dynamic>>? marks]) =>
    {'type': 'text', 'text': value, if (marks != null) 'marks': marks};

Map<String, dynamic> p(List<Map<String, dynamic>> content, [Object? align]) => {
  'type': 'paragraph',
  'attrs': {'textAlign': align},
  'content': content,
};

Map<String, dynamic> item(List<Map<String, dynamic>> content) => {
  'type': 'listItem',
  'content': content,
};

/// Documents shaped as the web editor stores them, including the parts
/// Quill cannot model.
final Map<String, Map<String, dynamic>> roundTripFixtures = {
  'headings and marks': {
    'type': 'doc',
    'content': [
      for (var level = 1; level <= 6; level++)
        {
          'type': 'heading',
          'attrs': {
            'level': level,
            'textAlign': level.isEven ? 'center' : null,
          },
          'content': [text('Heading $level')],
        },
      p([
        text('bold ', [
          {'type': 'bold'},
        ]),
        text('marked', [
          {'type': 'italic'},
          {'type': 'underline'},
          {'type': 'strike'},
        ]),
        text(' code', [
          {'type': 'code'},
        ]),
        text('2', [
          {'type': 'subscript'},
        ]),
        text('tinted', [
          {
            'type': 'highlight',
            'attrs': {
              'color': 'var(--calendar-bg-yellow)',
              'textColor': 'var(--yellow)',
            },
          },
        ]),
        text(' red', [
          {
            'type': 'textStyle',
            'attrs': {'color': 'var(--red)', 'backgroundColor': null},
          },
        ]),
        text(' link', [
          {
            'type': 'link',
            'attrs': {
              'href': 'https://tuturuuu.com',
              'target': '_blank',
              'rel': 'noopener noreferrer nofollow',
              'class': null,
            },
          },
        ]),
        {'type': 'hardBreak'},
        text('after break'),
      ], 'right'),
      {
        'type': 'paragraph',
        'attrs': {'textAlign': null},
      },
    ],
  },
  'lists with nested blocks': {
    'type': 'doc',
    'content': [
      {
        'type': 'bulletList',
        'content': [
          item([
            p([text('Parent')]),
            {
              'type': 'orderedList',
              'attrs': {'start': 3, 'type': null},
              'content': [
                item([
                  p([text('Child')]),
                ]),
              ],
            },
          ]),
          item([
            p([text('With code')]),
            {
              'type': 'codeBlock',
              'attrs': {'language': 'dart'},
              'content': [text('final a = 1;\nfinal b = 2;')],
            },
          ]),
        ],
      },
      p([text('Between')]),
      {
        'type': 'taskList',
        'content': [
          {
            'type': 'taskItem',
            'attrs': {'checked': 'indeterminate'},
            'content': [
              p([text('Partly done')]),
              {
                'type': 'taskList',
                'content': [
                  {
                    'type': 'taskItem',
                    'attrs': {'checked': true},
                    'content': [
                      p([text('Done')]),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  'quotes, code and rules': {
    'type': 'doc',
    'content': [
      {
        'type': 'blockquote',
        'content': [
          p([text('First quote line')]),
          p([text('Second quote line')]),
          {
            'type': 'bulletList',
            'content': [
              item([
                p([text('Quoted item')]),
              ]),
            ],
          },
        ],
      },
      {
        'type': 'codeBlock',
        'attrs': {'language': 'typescript'},
        'content': [text('const x = 1;')],
      },
      {'type': 'horizontalRule'},
      p([text('Closing')]),
    ],
  },
  'media, tables and atoms': {
    'type': 'doc',
    'content': [
      {
        'type': 'imageResize',
        'attrs': {
          'src': 'https://example.com/a.png',
          'alt': 'Chart',
          'title': null,
          'width': 320,
          'height': null,
          'containerStyle': 'width: 320px;',
          'wrapperStyle': 'display: flex;',
        },
      },
      {
        'type': 'video',
        'attrs': {'src': 'https://example.com/clip.mp4'},
      },
      {
        'type': 'youtube',
        'attrs': {'src': 'https://www.youtube.com/watch?v=abc', 'start': 0},
      },
      {
        'type': 'table',
        'content': [
          {
            'type': 'tableRow',
            'content': [
              {
                'type': 'tableHeader',
                'attrs': {'colspan': 1, 'rowspan': 1, 'colwidth': null},
                'content': [
                  p([text('Name')]),
                ],
              },
            ],
          },
        ],
      },
      p([
        text('See '),
        {
          'type': 'mention',
          'attrs': {
            'userId': 'u1',
            'entityId': 'u1',
            'entityType': 'user',
            'displayName': 'Linh',
            'avatarUrl': null,
            'subtitle': null,
          },
        },
        text(' and '),
        {
          'type': 'citation',
          'attrs': {
            'citationId': 'c1',
            'itemId': 'i1',
            'snapshot': {'title': 'Paper'},
            'locator': 'p. 4',
            'suppressAuthor': false,
          },
        },
      ]),
      {
        'type': 'citationBibliography',
        'attrs': {'style': 'apa'},
      },
      {
        'type': 'details',
        'content': [
          {
            'type': 'detailsSummary',
            'attrs': {'level': 2},
            'content': [text('Steps')],
          },
          {
            'type': 'detailsContent',
            'content': [
              p([text('Hidden body')]),
            ],
          },
        ],
      },
      {
        'type': 'futureWebNode',
        'attrs': {'answer': 42},
        'content': [
          p([text('Unknown')]),
        ],
      },
    ],
  },
  'adjacent blocks of one kind': {
    'type': 'doc',
    'content': [
      {
        'type': 'codeBlock',
        'attrs': {'language': 'typescript'},
        'content': [text('const a = 1;')],
      },
      {
        'type': 'codeBlock',
        'attrs': {'language': 'dart'},
        'content': [text('final b = 2;')],
      },
      {
        'type': 'paragraph',
        'attrs': {'textAlign': null},
      },
      {
        'type': 'bulletList',
        'content': [
          item([
            p([
              text('First list', [
                {
                  'type': 'link',
                  'attrs': {'href': 'https://tuturuuu.com', 'target': '_blank'},
                },
              ]),
            ]),
          ]),
        ],
      },
      {
        'type': 'bulletList',
        'content': [
          item([
            p([text('Second list')]),
            {
              'type': 'codeBlock',
              'attrs': {'language': 'sql'},
              'content': [text('select 1;')],
            },
          ]),
        ],
      },
      p([text('Closing')]),
    ],
  },
};
