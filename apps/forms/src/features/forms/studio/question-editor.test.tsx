import { fireEvent, render, screen } from '@testing-library/react';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { describe, expect, it, vi } from 'vitest';
import type { FormStudioInput } from '../schema';
import { QuestionEditor } from './question-editor';
import type { StudioForm } from './studio-utils';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/icons', () => ({
  Calendar: (props: any) => <svg {...props} />,
  ChevronDown: (props: any) => <svg {...props} />,
  ChevronUp: (props: any) => <svg {...props} />,
  CircleCheckBig: (props: any) => <svg {...props} />,
  ClipboardList: (props: any) => <svg {...props} />,
  Clock3: (props: any) => <svg {...props} />,
  Copy: (props: any) => <svg {...props} />,
  FileText: (props: any) => <svg {...props} />,
  Flag: (props: any) => <svg {...props} />,
  GripVertical: (props: any) => <svg {...props} />,
  Info: (props: any) => <svg {...props} />,
  ImagePlus: (props: any) => <svg {...props} />,
  ListChecks: (props: any) => <svg {...props} />,
  MessageSquare: (props: any) => <svg {...props} />,
  MoreHorizontal: (props: any) => <svg {...props} />,
  Minus: (props: any) => <svg {...props} />,
  Play: (props: any) => <svg {...props} />,
  Plus: (props: any) => <svg {...props} />,
  Shield: (props: any) => <svg {...props} />,
  Star: (props: any) => <svg {...props} />,
  Trash: (props: any) => <svg {...props} />,
}));

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}));

vi.mock('@tuturuuu/ui/badge', () => ({
  Badge: (props: any) => <div {...props} />,
}));

vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@tuturuuu/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...props}
    />
  ),
}));

vi.mock('@tuturuuu/ui/collapsible', () => ({
  Collapsible: ({ children }: any) => <div>{children}</div>,
  CollapsibleContent: ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
  CollapsibleTrigger: ({ children }: any) => <>{children}</>,
}));

vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, onSelect }: any) => (
    <div
      onClick={(e) => {
        if (onClick) onClick(e);
        if (onSelect) onSelect(e);
      }}
      role="menuitem"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (onClick) onClick(e as any);
          if (onSelect) onSelect(e as any);
        }
      }}
    >
      {children}
    </div>
  ),
}));

vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@tuturuuu/ui/label', () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock('@tuturuuu/ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SelectTrigger: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

vi.mock('@tuturuuu/ui/separator', () => ({
  Separator: (props: any) => <div {...props} />,
}));

vi.mock('@tuturuuu/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

vi.mock('../forms-markdown', () => ({
  FormsMarkdown: ({ content }: any) => <div>{content}</div>,
}));

vi.mock('../forms-rich-text-editor', () => ({
  FormsRichTextEditor: ({ value, onChange, placeholder }: any) => (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock('./destructive-action-dialog', () => ({
  DestructiveActionDialog: ({ trigger }: any) => trigger,
}));

vi.mock('./form-media-field', () => ({
  FormMediaField: () => <div>media-field</div>,
}));

function TestHarness() {
  const form = useForm<FormStudioInput>({
    defaultValues: {
      title: 'Form',
      description: '',
      status: 'draft',
      accessMode: 'anonymous',
      openAt: null,
      closeAt: null,
      maxResponses: null,
      theme: {
        presetId: 'editorial-moss',
        density: 'balanced',
        accentColor: 'dynamic-green',
        headlineFontId: 'noto-serif',
        bodyFontId: 'be-vietnam-pro',
        surfaceStyle: 'paper',
        coverHeadline: '',
        coverImage: { storagePath: '', url: '', alt: '' },
        sectionImages: {},
        typography: {
          displaySize: 'md',
          headingSize: 'md',
          bodySize: 'md',
        },
      },
      settings: {
        showProgressBar: true,
        allowMultipleSubmissions: true,
        oneResponsePerUser: false,
        requireTurnstile: true,
        confirmationTitle: 'Thanks',
        confirmationMessage: 'Done',
      },
      sections: [
        {
          id: 'section-1',
          title: 'Section 1',
          description: '',
          image: { storagePath: '', url: '', alt: '' },
          questions: [
            {
              id: 'question-1',
              type: 'linear_scale',
              title: 'How was it?',
              description: '',
              required: false,
              settings: {
                minLabel: '',
                maxLabel: '',
                scaleMin: 1,
                scaleMax: 5,
              },
              options: [
                {
                  id: 'o1',
                  label: '1',
                  value: '1',
                  image: { storagePath: '', url: '', alt: '' },
                },
                {
                  id: 'o2',
                  label: '2',
                  value: '2',
                  image: { storagePath: '', url: '', alt: '' },
                },
                {
                  id: 'o3',
                  label: '3',
                  value: '3',
                  image: { storagePath: '', url: '', alt: '' },
                },
                {
                  id: 'o4',
                  label: '4',
                  value: '4',
                  image: { storagePath: '', url: '', alt: '' },
                },
                {
                  id: 'o5',
                  label: '5',
                  value: '5',
                  image: { storagePath: '', url: '', alt: '' },
                },
              ],
            },
          ],
        },
      ],
      logicRules: [],
    },
  });

  return (
    <QuestionEditor
      wsId="ws-1"
      questionId="question-1"
      sectionIndex={0}
      questionIndex={0}
      form={form as StudioForm}
      open
      onOpenChange={() => {}}
      onMoveUp={() => {}}
      onMoveDown={() => {}}
      onDuplicate={() => {}}
      onRemove={() => {}}
      toneClasses={
        {
          selectedOptionClassName: '',
          fieldClassName: '',
          optionCardClassName: '',
          checkboxClassName: '',
          secondaryButtonClassName: '',
        } as any
      }
    />
  );
}

describe('QuestionEditor scale settings', () => {
  it('keeps scale labels editable through re-renders', () => {
    render(<TestHarness />);

    const minLabelInput = screen.getByPlaceholderText('studio.minimum_label');
    const maxLabelInput = screen.getByPlaceholderText('studio.maximum_label');
    const scaleMaxInput = screen.getAllByRole('spinbutton')[1];

    fireEvent.change(minLabelInput, { target: { value: 'Not great' } });
    fireEvent.change(maxLabelInput, { target: { value: 'Excellent' } });
    fireEvent.change(scaleMaxInput!, { target: { value: '6' } });

    expect(minLabelInput).toHaveValue('Not great');
    expect(maxLabelInput).toHaveValue('Excellent');
  });
});
