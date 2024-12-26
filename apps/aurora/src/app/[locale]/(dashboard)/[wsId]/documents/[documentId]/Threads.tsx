import {
  AnchoredThreads,
  FloatingComposer,
  FloatingThreads,
} from '@liveblocks/react-tiptap';
import { useThreads } from '@liveblocks/react/suspense';
import { Editor } from '@tiptap/react';

export function Threads({ editor }: { editor: Editor | null }) {
  const { threads } = useThreads({ query: { resolved: false } });

  return (
    <>
      {/* Anchored Threads (Desktop) */}
      <div className="fixed right-4 top-16 z-50 hidden w-[350px] md:block">
        <AnchoredThreads editor={editor} threads={threads} />
      </div>

      {/* Floating Threads (Mobile) */}
      <FloatingThreads
        editor={editor}
        threads={threads}
        className="block md:hidden"
      />

      {/* Floating Composer */}
      <FloatingComposer
        editor={editor}
        className="fixed bottom-4 left-4 z-50 block w-[70px] md:hidden"
      />
    </>
  );
}
