import type { ComponentEntry } from './component-registry-core';
import { usage } from './component-registry-core';

export const foundationInputComponentEntries: ComponentEntry[] = [
  {
    id: 'input',
    name: 'Input',
    category: 'inputs',
    importPath: '@tuturuuu/ui/input',
    exports: ['Input'],
    customizationKeys: ['type', 'placeholder', 'disabled'],
    usage: usage(
      '@tuturuuu/ui/input',
      ['Input'],
      `<Input placeholder="Workspace name" />`
    ),
  },
  {
    id: 'input-otp',
    name: 'Input OTP',
    category: 'inputs',
    importPath: '@tuturuuu/ui/input-otp',
    exports: ['InputOTP', 'InputOTPGroup', 'InputOTPSlot'],
    customizationKeys: ['length', 'separator', 'masking'],
    usage: usage(
      '@tuturuuu/ui/input-otp',
      ['InputOTP', 'InputOTPGroup', 'InputOTPSlot'],
      `<InputOTP maxLength={6}>\n  <InputOTPGroup>{[0, 1, 2].map((index) => <InputOTPSlot key={index} index={index} />)}</InputOTPGroup>\n</InputOTP>`
    ),
  },
  {
    id: 'kbd',
    name: 'Kbd',
    category: 'typography',
    importPath: '@tuturuuu/ui/kbd',
    exports: ['Kbd'],
    customizationKeys: ['keys', 'size', 'sequence'],
    usage: usage('@tuturuuu/ui/kbd', ['Kbd'], `<Kbd>Cmd K</Kbd>`),
  },
  {
    id: 'label',
    name: 'Label',
    category: 'inputs',
    importPath: '@tuturuuu/ui/label',
    exports: ['Label'],
    customizationKeys: ['htmlFor', 'required', 'disabled'],
    usage: usage(
      '@tuturuuu/ui/label',
      ['Label'],
      `<Label htmlFor="workspace">Workspace</Label>`
    ),
  },
  {
    id: 'markdown',
    name: 'Markdown',
    category: 'typography',
    importPath: '@tuturuuu/ui/markdown',
    exports: ['MemoizedReactMarkdown'],
    customizationKeys: ['components', 'content', 'memoization'],
    usage: usage(
      '@tuturuuu/ui/markdown',
      ['MemoizedReactMarkdown'],
      `<MemoizedReactMarkdown>{markdown}</MemoizedReactMarkdown>`
    ),
  },
];
