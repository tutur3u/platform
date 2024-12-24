import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

interface PromptWorkbenchProps {
  prompt: string
  setPrompt: (prompt: string) => void
  onRunPrompt: () => void
  isLoading: boolean
  versions: { id: number; prompt: string }[]
  currentVersion: number
  onSaveVersion: () => void
  onLoadVersion: (versionId: number) => void
}

export function PromptWorkbench({
  prompt,
  setPrompt,
  onRunPrompt,
  isLoading,
  versions,
  currentVersion,
  onSaveVersion,
  onLoadVersion
}: PromptWorkbenchProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Prompt Engineering Workbench</span>
          <div className="flex items-center space-x-2">
            <Select value={currentVersion.toString()} onValueChange={(value) => onLoadVersion(parseInt(value))}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={version.id.toString()}>
                    Version {version.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={onSaveVersion} variant="outline">Save Version</Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your prompt here..."
          className="min-h-[200px] resize-none"
        />
        <div className="flex justify-end">
          <Button 
            onClick={onRunPrompt} 
            disabled={isLoading || prompt.trim() === ''}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running Prompt...
              </>
            ) : (
              'Run Prompt'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

