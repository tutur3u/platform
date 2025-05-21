"use client";

import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ToolBar from "./tool-bar";

interface RichTextEditorProps {
    content: string;
    onChange: (content: string) => void;
}
export default function RichTextEditor({
    content,
    onChange,
}: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                bulletList: {
                    HTMLAttributes: {
                        class: "list-disc ml-3",
                    },
                },
                orderedList: {
                    HTMLAttributes: {
                        class: "list-decimal ml-3",
                    },
                },
            }),
            TextAlign.configure({
                types: ["heading", "paragraph"],
            }),
            Placeholder.configure({
                placeholder: ({ node }) => {
                    if (node.type.name === "heading") {
                        return "What's the title?";
                    }
                    return "Write something...";
                },
                emptyNodeClass: "is-empty",
            }),
            Highlight,
        ],
        content: content,
        editorProps: {
            attributes: {
                class: "min-h-[156px] border rounded-md bg-white py-2 px-3 prose prose-slate max-w-none [&_*:is(p,h1,h2,h3).is-empty::before]:content-[attr(data-placeholder)] [&_*:is(p,h1,h2,h3).is-empty::before]:text-gray-400 [&_*:is(p,h1,h2,h3).is-empty::before]:float-left [&_*:is(p,h1,h2,h3).is-empty::before]:h-0 [&_*:is(p,h1,h2,h3).is-empty::before]:pointer-events-none",
            },
        },
        onUpdate: ({ editor }) => {
            // console.log(editor.getHTML());
            onChange(editor.getHTML());
        },
    });

    return (
        <div>
            <ToolBar editor={editor} />
            <EditorContent editor={editor} />
        </div>
    );
}