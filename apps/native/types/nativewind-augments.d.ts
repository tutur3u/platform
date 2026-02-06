/**
 * NativeWind type augmentations for React Native components.
 *
 * With `preserveSymlinks: true` in tsconfig (required to fix @types/react
 * version conflicts in bun's .bun store), NativeWind's built-in type
 * augmentations don't resolve correctly. This file provides the missing
 * `className` and `contentContainerClassName` props.
 */
import 'react-native';

declare module 'react-native' {
  interface FlatListProps<ItemT> {
    className?: string;
    contentContainerClassName?: string;
  }

  interface SectionListProps<ItemT, SectionT> {
    className?: string;
    contentContainerClassName?: string;
  }

  interface ScrollViewProps {
    className?: string;
    contentContainerClassName?: string;
  }
}
