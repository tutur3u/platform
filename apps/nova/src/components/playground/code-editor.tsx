import { useState } from 'react'
import Editor from '@monaco-editor/react'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface CodeEditorProps {
  code: string
  setCode: (code: string) => void
}

export function CodeEditor({ code, setCode }: CodeEditorProps) {
  const [theme, setTheme] = useState('vs-dark')

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Code Editor</CardTitle>
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Select theme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vs-dark">Dark</SelectItem>
              <SelectItem value="light">Light</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="flex-grow p-0">
        <Editor
          height="100%"
          language="python"
          theme={theme}
          value={code}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            roundedSelection: false,
            scrollBeyondLastLine: false,
            readOnly: false,
          }}
        />
      </CardContent>
    </div>
  )
}

