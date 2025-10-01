declare module 'tiptap-extension-video' {
  import type { Node } from '@tiptap/core';

  interface VideoOptions {
    inline?: boolean;
    allowBase64?: boolean;
    HTMLAttributes?: Record<string, any>;
  }

  const Video: Node<VideoOptions>;
  export default Video;
  export type { Video as video };
}
