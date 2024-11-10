import { useEffect, useState } from 'react'
import { useEditor, useEditorState } from '@tiptap/react'
import type { AnyExtension, Editor } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import { TiptapCollabProvider, WebSocketStatus } from '@hocuspocus/provider'
import type { Doc as YDoc } from 'yjs'

import { ExtensionKit } from '@/extensions/extension-kit'
import { userColors, userNames } from '../lib/constants'
import { randomElement } from '@/lib/utils/index'
import type { EditorUser } from '@/components/components/BlockEditor/BlockEditor'
import { initialContent } from '@/lib/data/initialContent'
import { Ai } from '@/extensions/Ai'
import { AiImage, AiWriter } from '@/extensions'



declare global {
    interface Window {
      editor: Editor | null
    }
  }
  
  export const useBlockEditor = ({
    aiToken,
    ydoc,
    provider,
    userId,
    userName = 'Maxi',
  }: {
    aiToken?: string
    ydoc: YDoc
    provider?: TiptapCollabProvider | null | undefined
    userId?: string
    userName?: string
  }) => {
    const [collabState, setCollabState] = useState<WebSocketStatus>(
      provider ? WebSocketStatus.Connecting : WebSocketStatus.Disconnected,
    )
  
    const editor = useEditor(
      {
        immediatelyRender: true,
        shouldRerenderOnTransaction: false,
        autofocus: true,
        onCreate: ctx => {
          if (provider && !provider.isSynced) {
            provider.on('synced', () => {
              setTimeout(() => {
                if (ctx.editor.isEmpty) {
                  ctx.editor.commands.setContent(initialContent)
                }
              }, 0)
            })
          } else if (ctx.editor.isEmpty) {
            ctx.editor.commands.setContent(initialContent)
            ctx.editor.commands.focus('start', { scrollIntoView: true })
          }
        },
        extensions: [
          ...ExtensionKit({
            provider,
          }),
          provider
            ? Collaboration.configure({
                document: ydoc,
              })
            : undefined,
          provider
            ? CollaborationCursor.configure({
                provider,
                user: {
                  name: randomElement(userNames),
                  color: randomElement(userColors),
                },
              })
            : undefined,
          aiToken
            ? AiWriter.configure({
                authorId: userId,
                authorName: userName,
              })
            : undefined,
          aiToken
            ? AiImage.configure({
                authorId: userId,
                authorName: userName,
              })
            : undefined,
          aiToken ? Ai.configure({ token: aiToken }) : undefined,
        ].filter((e): e is AnyExtension => e !== undefined),
        editorProps: {
          attributes: {
            autocomplete: 'off',
            autocorrect: 'off',
            autocapitalize: 'off',
            class: 'min-h-full',
          },
        },
      },
      [ydoc, provider],
    )
    const users = useEditorState({
      editor,
      selector: (ctx): (EditorUser & { initials: string })[] => {
        if (!ctx.editor?.storage.collaborationCursor?.users) {
          return []
        }
  
        return ctx.editor.storage.collaborationCursor.users.map((user: EditorUser) => {
          const names = user.name?.split(' ')
          const firstName = names?.[0]
          const lastName = names?.[names.length - 1]
          const initials = `${firstName?.[0] || '?'}${lastName?.[0] || '?'}`
  
          return { ...user, initials: initials.length ? initials : '?' }
        })
      },
    })
  
    useEffect(() => {
      provider?.on('status', (event: { status: WebSocketStatus }) => {
        setCollabState(event.status)
      })
    }, [provider])
  
    window.editor = editor
  
    return { editor, users, collabState }
  }
  