import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { z } from 'zod';

export const dashboardCatalog = defineCatalog(schema, {
  components: {
    Card: {
      props: z.object({
        title: z
          .string()
          .optional()
          .describe(
            'Card header title. Use this instead of a separate Text child for section headers.'
          ),
        description: z
          .string()
          .nullable()
          .optional()
          .describe('Optional subtitle below the title'),
      }),
      hasChildren: true,
      description:
        'A styled container to group related content. Always use the `title` prop for section headers instead of adding a Text child.',
    },
    Stack: {
      props: z.object({
        direction: z
          .enum(['vertical', 'horizontal'])
          .optional()
          .describe('Layout direction, defaults to vertical'),
        gap: z.number().optional().describe('Gap between children in pixels'),
        align: z
          .enum(['start', 'center', 'end', 'stretch'])
          .optional()
          .describe('Alignment of children'),
        justify: z
          .enum(['start', 'center', 'end', 'between', 'around'])
          .optional()
          .describe('Justification of children'),
      }),
      hasChildren: true,
      description: 'A flexible flexbox container for layout.',
    },
    Grid: {
      props: z.object({
        cols: z
          .number()
          .optional()
          .describe('Number of columns, defaults to 1'),
        gap: z.number().optional().describe('Gap between children in pixels'),
      }),
      hasChildren: true,
      description: 'A grid container for multi-column layouts.',
    },
    Text: {
      props: z.object({
        content: z
          .string()
          .describe(
            'The text string to display. IMPORTANT: use "content", NOT "text".'
          ),
        variant: z
          .enum(['h1', 'h2', 'h3', 'h4', 'p', 'small', 'tiny'])
          .optional()
          .describe(
            'Typography variant. Valid: h1, h2, h3, h4, p, small, tiny. Do NOT use "body".'
          ),
        weight: z
          .enum(['normal', 'medium', 'semibold', 'bold'])
          .optional()
          .describe('Font weight'),
        color: z
          .enum(['default', 'muted', 'primary', 'success', 'warning', 'error'])
          .optional()
          .describe('Text color'),
        align: z
          .enum(['left', 'center', 'right'])
          .optional()
          .describe('Text alignment'),
      }),
      hasChildren: false,
      description:
        'Renders text. The prop for the text string is `content` (NOT `text`). Example: { "content": "Hello", "variant": "p" }',
    },
    Icon: {
      props: z.object({
        name: z.string().describe('Name of the icon (e.g. "User", "Check")'),
        size: z.number().optional().describe('Size in pixels, defaults to 16'),
        color: z.string().optional().describe('Icon color (CSS color or hex)'),
      }),
      hasChildren: false,
      description: 'Display an icon from the platform icon set.',
    },
    Badge: {
      props: z.object({
        label: z.string().describe('The label shown in the badge'),
        variant: z
          .enum([
            'default',
            'secondary',
            'outline',
            'success',
            'warning',
            'error',
          ])
          .optional()
          .describe('Badge visual style'),
      }),
      hasChildren: false,
      description: 'A small status indicator badge.',
    },
    Avatar: {
      props: z.object({
        src: z.string().optional().describe('URL of the image'),
        fallback: z.string().optional().describe('Fallback initials'),
        size: z.number().optional().describe('Size in pixels, defaults to 32'),
      }),
      hasChildren: false,
      description: 'A circular profile image component.',
    },
    Separator: {
      props: z.object({
        orientation: z
          .enum(['horizontal', 'vertical'])
          .optional()
          .describe('Orientation, defaults to horizontal'),
      }),
      hasChildren: false,
      description: 'A visual line to separate content.',
    },
    Callout: {
      props: z.object({
        content: z
          .string()
          .describe('The callout message text. Use `content`, NOT `text`.'),
        variant: z
          .enum(['info', 'success', 'warning', 'error'])
          .optional()
          .describe('Callout style, defaults to info'),
        title: z.string().optional().describe('Optional bold title'),
      }),
      hasChildren: false,
      description:
        'A colored banner for informational messages (e.g. "No tasks today!", status updates). Use the `content` prop for the message text.',
    },
    ListItem: {
      props: z.object({
        title: z.string().describe('Primary text'),
        subtitle: z
          .string()
          .optional()
          .describe('Secondary text shown below the title'),
        icon: z
          .string()
          .optional()
          .describe(
            'Lucide icon name in PascalCase (e.g. "Calendar", "Wallet")'
          ),
        iconColor: z
          .string()
          .optional()
          .describe('Custom color for the icon pill'),
        trailing: z
          .string()
          .optional()
          .describe('Optional trailing text (e.g. time, amount)'),
        action: z
          .string()
          .optional()
          .describe('Action key to trigger on click'),
      }),
      hasChildren: false,
      description:
        'A structured row with icon, title, subtitle, and trailing text. Perfect for event lists, task items, transaction rows.',
    },
    Progress: {
      props: z.object({
        value: z.number().describe('Progress value from 0 to 100'),
        label: z.string().optional().describe('Optional label'),
        showValue: z
          .boolean()
          .optional()
          .describe('Whether to show the percentage'),
        color: z
          .enum(['default', 'success', 'warning', 'error'])
          .optional()
          .describe(
            'Progress bar color. Defaults to auto: green >66, yellow >33, red ≤33'
          ),
      }),
      hasChildren: false,
      description: 'A progress bar component.',
    },
    Tabs: {
      props: z.object({
        tabs: z
          .array(
            z.object({
              id: z.string().describe('Unique ID for the tab'),
              label: z.string().describe('Display label for the tab'),
            })
          )
          .describe('List of tabs to show'),
        defaultTab: z.string().optional().describe('ID of the default tab'),
      }),
      hasChildren: true,
      description:
        'A tabbed interface. Children should be elements that respond to the active tab state (visible when tab matches).',
    },
    BarChart: {
      props: z.object({
        data: z
          .array(
            z.object({
              label: z.string().describe('Label for the bar'),
              value: z
                .number()
                .describe('Value for the bar (0-100 recommended)'),
              color: z
                .string()
                .optional()
                .describe('Hex color or dynamic token'),
            })
          )
          .describe('Data points for the chart'),
        height: z.number().optional().describe('Chart height in pixels'),
      }),
      hasChildren: false,
      description:
        'A simple vertical bar chart for visualizing lists of numbers.',
    },
    ArticleHeader: {
      props: z.object({
        eyebrow: z
          .string()
          .optional()
          .describe('Small context label shown above the title'),
        title: z.string().describe('Main article title'),
        subtitle: z
          .string()
          .optional()
          .describe('Supporting subtitle under the title'),
        byline: z.string().optional().describe('Author or analyst line'),
        publishedAt: z
          .string()
          .optional()
          .describe('Published or updated date text'),
        readingTime: z
          .string()
          .optional()
          .describe('Estimated reading time (e.g. "4 min read")'),
      }),
      hasChildren: false,
      description:
        'Hero-style heading block for blog/news content with title, subtitle, and metadata.',
    },
    InsightSection: {
      props: z.object({
        title: z.string().describe('Section heading'),
        summary: z
          .string()
          .optional()
          .describe('Optional short section summary'),
        tone: z
          .enum(['neutral', 'positive', 'warning', 'critical'])
          .optional()
          .describe('Visual emphasis style'),
      }),
      hasChildren: true,
      description:
        'Structured section wrapper for article-like analysis. Place supporting Text/List components as children.',
    },
    KeyPoints: {
      props: z.object({
        title: z
          .string()
          .optional()
          .describe('Optional heading for the key points block'),
        points: z
          .array(z.string())
          .min(1)
          .describe('Bullet or numbered key points'),
        ordered: z
          .boolean()
          .optional()
          .describe('Render numbered list when true'),
      }),
      hasChildren: false,
      description:
        'Compact bullet/numbered list for takeaways, action items, or summary points.',
    },
    SourceList: {
      props: z.object({
        title: z
          .string()
          .optional()
          .describe('Optional heading for the sources section'),
        compact: z
          .boolean()
          .optional()
          .describe(
            'Use compact 2-column source chips when true (default true)'
          ),
        showUrl: z
          .boolean()
          .optional()
          .describe(
            'Show shortened URL preview under each source (default false)'
          ),
        sources: z
          .array(
            z.object({
              title: z
                .string()
                .describe(
                  'Human-readable source title (never paste full URL here)'
                ),
              url: z.httpUrl().describe('Source URL'),
              publisher: z
                .string()
                .optional()
                .describe(
                  'Publisher/domain label like "Microsoft" or "InfoWorld"'
                ),
              note: z
                .string()
                .optional()
                .describe('Optional short context note (keep concise)'),
            })
          )
          .min(1)
          .describe('List of sources'),
      }),
      hasChildren: false,
      description:
        'Reference list with clickable links for research/news responses.',
    },
    Stat: {
      props: z.object({
        label: z.string().describe('Short label'),
        value: z.string().describe('Stat value'),
        icon: z.string().optional().describe('Lucide icon name'),
      }),
      hasChildren: false,
      description: 'A compact, inline-friendly version of Metric.',
    },
    Metric: {
      props: z.object({
        title: z.string().describe('The name of the metric'),
        value: z.string().describe('The value to display'),
        trend: z
          .enum(['up', 'down', 'neutral'])
          .optional()
          .describe('The trend of the metric'),
        trendValue: z
          .string()
          .optional()
          .describe('The trend value to display, e.g. "+5%"'),
      }),
      hasChildren: false,
      description: 'A component used to display a single, prominent metric.',
    },
    MyTasks: {
      props: z.object({
        showSummary: z
          .boolean()
          .optional()
          .describe('Whether to show the task summary cards'),
        showFilters: z
          .boolean()
          .optional()
          .describe('Whether to show the task filter bar'),
      }),
      hasChildren: false,
      description: "A component that renders the user's current task list.",
    },
    TimeTrackingStats: {
      props: z
        .object({
          period: z
            .enum([
              'today',
              'this_week',
              'this_month',
              'last_7_days',
              'last_30_days',
              'custom',
            ])
            .optional()
            .describe('Stats period preset. Defaults to last_7_days.'),
          dateFrom: z
            .string()
            .datetime({ offset: true })
            .optional()
            .describe(
              'Custom period start ISO datetime (required when period=custom).'
            ),
          dateTo: z
            .string()
            .datetime({ offset: true })
            .optional()
            .describe(
              'Custom period end ISO datetime (required when period=custom).'
            ),
          showBreakdown: z
            .boolean()
            .optional()
            .describe('Show category breakdown list (default true).'),
          showDailyBreakdown: z
            .boolean()
            .optional()
            .describe('Show daily breakdown list (default true).'),
          maxItems: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .describe('Maximum rows for breakdown sections (default 5).'),
        })
        .superRefine((data, ctx) => {
          if (data.period !== 'custom') return;

          if (!data.dateFrom) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['dateFrom'],
              message: 'dateFrom is required when period is custom',
            });
          }

          if (!data.dateTo) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['dateTo'],
              message: 'dateTo is required when period is custom',
            });
          }
        }),
      hasChildren: false,
      description:
        'A standardized time-tracking stats dashboard that fetches and displays period metrics and breakdowns.',
    },
    Form: {
      props: z.object({
        title: z.string().describe('Form title to display'),
        description: z.string().optional().describe('Form description'),
        submitLabel: z
          .string()
          .optional()
          .describe('Text for the submit button, defaults to "Submit"'),
        submitAction: z
          .string()
          .optional()
          .describe(
            'The name of the action to trigger on submit (e.g. "submit_form")'
          ),
        submitParams: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Optional static params merged into submit payload'),
        onSubmit: z
          .unknown()
          .optional()
          .describe(
            'Binding for the submit action; value is validated later by action schemas at submit time.'
          ),
      }),
      hasChildren: true,
      description:
        'A form container for capturing user input. Should contain Input and other form elements, and trigger a submit action.',
    },
    Input: {
      props: z.object({
        name: z.string().describe('Field name/ID'),
        label: z.string().describe('Field label shown to user'),
        placeholder: z.string().optional().describe('Placeholder text'),
        required: z
          .boolean()
          .optional()
          .describe('Whether the field is required'),
        type: z
          .enum(['text', 'number', 'email', 'password', 'datetime-local'])
          .optional()
          .describe('Input type, defaults to text'),
        value: z
          .union([z.string(), z.number()])
          .optional()
          .describe(
            'Input value binding; value is validated later by action schemas at submit time.'
          ),
      }),
      hasChildren: false,
      description: 'A text or number input field for a Form.',
    },
    FileAttachmentInput: {
      props: z.object({
        name: z.string().describe('Field name/ID'),
        label: z.string().describe('Field label shown to user'),
        description: z.string().optional().describe('Optional helper text'),
        required: z
          .boolean()
          .optional()
          .describe('Whether at least one file is required'),
        maxFiles: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe('Maximum files allowed'),
        accept: z
          .string()
          .optional()
          .describe('Accepted mime types or extensions'),
        value: z
          .unknown()
          .optional()
          .describe(
            'Attachment value binding; value is validated later by action schemas at submit time.'
          ),
      }),
      hasChildren: false,
      description:
        'An attachment picker for forms that need evidence images or file uploads.',
    },
    Textarea: {
      props: z.object({
        name: z.string().describe('Field name/ID'),
        label: z.string().describe('Field label shown to user'),
        placeholder: z.string().optional().describe('Placeholder text'),
        required: z
          .boolean()
          .optional()
          .describe('Whether the field is required'),
        rows: z.number().optional().describe('Number of rows'),
        value: z
          .string()
          .optional()
          .describe(
            'Textarea value binding; value is validated later by action schemas at submit time.'
          ),
      }),
      hasChildren: false,
      description: 'A multi-line text input field for a Form.',
    },
    Checkbox: {
      props: z.object({
        name: z.string().describe('Field name/ID'),
        label: z.string().describe('Label shown next to checkbox'),
        description: z.string().optional().describe('Optional description'),
        required: z
          .boolean()
          .optional()
          .describe('Whether the field is required'),
        checked: z
          .unknown()
          .optional()
          .describe(
            'Checkbox checked binding; value is validated later by action schemas at submit time.'
          ),
      }),
      hasChildren: false,
      description: 'A single checkbox component.',
    },
    CheckboxGroup: {
      props: z.object({
        name: z.string().describe('Field name/ID'),
        label: z.string().describe('Group label'),
        options: z
          .array(
            z.object({
              label: z.string(),
              value: z.string(),
            })
          )
          .describe('Options to choose from'),
        required: z
          .boolean()
          .optional()
          .describe('Whether at least one option is required'),
        values: z
          .unknown()
          .optional()
          .describe(
            'Checkbox group values binding; value is validated later by action schemas at submit time.'
          ),
      }),
      hasChildren: false,
      description: 'A group of checkboxes for multiple selection.',
    },
    RadioGroup: {
      props: z.object({
        name: z.string().describe('Field name/ID'),
        label: z.string().describe('Group label'),
        options: z
          .array(
            z.object({
              label: z.string(),
              value: z.string(),
            })
          )
          .describe('Options to choose from'),
        required: z
          .boolean()
          .optional()
          .describe('Whether an option is required'),
        value: z
          .unknown()
          .optional()
          .describe(
            'Radio group value binding; value is validated later by action schemas at submit time.'
          ),
      }),
      hasChildren: false,
      description: 'A group of radio buttons for single selection.',
    },
    Select: {
      props: z.object({
        name: z.string().describe('Field name/ID'),
        label: z.string().describe('Select label'),
        placeholder: z.string().optional().describe('Placeholder text'),
        options: z
          .array(
            z.object({
              label: z.string(),
              value: z.string(),
            })
          )
          .describe('Options to choose from'),
        required: z
          .boolean()
          .optional()
          .describe('Whether the field is required'),
        value: z
          .unknown()
          .optional()
          .describe(
            'Select value binding; value is validated later by action schemas at submit time.'
          ),
      }),
      hasChildren: false,
      description: 'A dropdown select component.',
    },
    Button: {
      props: z.object({
        label: z.string().describe('Button text'),
        variant: z
          .enum([
            'default',
            'secondary',
            'destructive',
            'outline',
            'ghost',
            'link',
          ])
          .optional()
          .describe('Button visual style'),
        size: z.enum(['default', 'sm', 'lg', 'icon']).optional(),
        icon: z.string().optional().describe('Lucide icon name'),
        action: z.string().optional().describe('Action key to trigger'),
      }),
      hasChildren: false,
      description:
        'A button to trigger an action within a Form or interactive component.',
    },
    Flashcard: {
      props: z.object({
        front: z.string().describe('Text for the front of the flashcard'),
        back: z.string().describe('Text for the back of the flashcard'),
        randomize: z
          .boolean()
          .optional()
          .describe('Whether to randomize side on start'),
      }),
      hasChildren: false,
      description: 'An interactive flashcard that flips when clicked.',
    },
    MultiFlashcard: {
      props: z.object({
        title: z.string().optional().describe('Title of the flashcard session'),
        description: z
          .string()
          .optional()
          .describe('Description or instructions'),
        flashcards: z
          .array(
            z.object({
              front: z.string().describe('Text for the front'),
              back: z.string().describe('Text for the back'),
            })
          )
          .describe('Array of flashcards'),
        randomize: z
          .boolean()
          .optional()
          .describe('Whether to randomize flashcard order'),
      }),
      hasChildren: false,
      description: 'A collection of interactive flashcards with navigation.',
    },
    Quiz: {
      props: z.object({
        question: z.string().describe('The quiz question'),
        options: z
          .array(z.string())
          .min(1)
          .describe('An array of string options for the quiz'),
        answer: z
          .string()
          .describe(
            'The correct option (must exactly match one of the options)'
          ),
        explanation: z
          .string()
          .optional()
          .describe('Explanation shown after answering'),
        randomize: z
          .boolean()
          .optional()
          .describe('Whether to randomize option order'),
      }),
      hasChildren: false,
      description: 'An interactive multiple-choice quiz question.',
    },
    MultiQuiz: {
      props: z.object({
        title: z
          .string()
          .optional()
          .describe('Title of the multi-quiz session'),
        description: z
          .string()
          .optional()
          .describe('Description or instructions'),
        quizzes: z
          .array(
            z.object({
              question: z.string().describe('The quiz question'),
              options: z
                .array(z.string())
                .min(1)
                .describe('An array of string options'),
              answer: z.string().describe('The correct option'),
              explanation: z
                .string()
                .optional()
                .describe('Explanation shown after answering'),
            })
          )
          .min(1)
          .describe('Array of quiz questions'),
        randomize: z
          .boolean()
          .optional()
          .describe('Whether to randomize quiz order'),
      }),
      hasChildren: false,
      description:
        'An interactive multi-question quiz with navigation and scoring.',
    },
  },
  actions: {
    submit_form: {
      params: z.object({
        title: z.string().describe('The title of the form being submitted'),
        values: z
          .record(z.string(), z.unknown())
          .describe('The values of the form fields'),
      }),
      description: 'Submit a generic form back to the assistant.',
    },
    log_transaction: {
      params: z.object({
        amount: z
          .number()
          .describe('Amount (positive=income, negative=expense)'),
        description: z.string().nullable().describe('What was this for?'),
        walletId: z
          .string()
          .nullable()
          .describe('Wallet UUID. If null, uses the first wallet.'),
      }),
      description:
        'Log a financial transaction directly from a generated UI form.',
    },
    create_time_tracking_request: {
      params: z
        .object({
          wsId: z.string().describe('Workspace ID slug or UUID'),
          requestId: z
            .string()
            .uuid()
            .optional()
            .describe('Request UUID used for storage prefix'),
          title: z.string().describe('Request title'),
          description: z
            .string()
            .optional()
            .describe('Optional request details'),
          categoryId: z
            .string()
            .nullable()
            .optional()
            .describe('Category UUID or null'),
          taskId: z
            .string()
            .nullable()
            .optional()
            .describe('Task UUID or null'),
          date: z
            .string()
            .optional()
            .describe(
              'Optional base date (YYYY-MM-DD) when using HH:mm inputs'
            ),
          startTime: z
            .string()
            .describe(
              'Start time (ISO 8601, YYYY-MM-DD HH:mm, or HH:mm with date)'
            ),
          endTime: z
            .string()
            .describe(
              'End time (ISO 8601, YYYY-MM-DD HH:mm, or HH:mm with date)'
            ),
          imagePaths: z
            .array(z.string())
            .max(5)
            .optional()
            .describe('Optional pre-uploaded storage paths (max 5).'),
        })
        .superRefine((data, ctx) => {
          const paths = data.imagePaths ?? [];
          if (paths.length === 0) return;

          if (!data.requestId) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['requestId'],
              message: 'requestId is required when imagePaths are provided',
            });
            return;
          }

          for (let index = 0; index < paths.length; index++) {
            const path = paths[index];
            if (!path?.startsWith(`${data.requestId}/`)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['imagePaths', index],
                message: `Each image path must start with \`${data.requestId}/\` when requestId is provided`,
              });
            }
          }
        }),
      description:
        'Submit a time tracking missed-entry request with optional evidence attachments.',
    },
    __ui_action__: {
      params: z.object({
        id: z
          .string()
          .optional()
          .describe('Action identifier from Button/ListItem props.action'),
        label: z
          .string()
          .optional()
          .describe('Optional display label from the clicked component'),
        source: z
          .enum(['button', 'list-item', 'ui'])
          .optional()
          .describe('Origin of the action trigger'),
      }),
      description:
        'Generic follow-up action emitted when a clickable generated UI element is activated.',
    },
  },
});
