import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Challenge } from '@/types/challenge'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ProblemDescriptionProps {
  challenge: Challenge
}

export function ProblemDescription({ challenge }: ProblemDescriptionProps) {
  return (
    <div className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>{challenge.title}</span>
          <Badge variant="secondary">{challenge.topic}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow p-0">
        <ScrollArea className="h-full">
          <div className="space-y-4 p-6">
            <div className="prose dark:prose-invert">
              <p>{challenge.description}</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Example Input:</h3>
              <pre className="bg-muted p-2 rounded-md overflow-x-auto">
                <code>{challenge.exampleInput}</code>
              </pre>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Example Output:</h3>
              <pre className="bg-muted p-2 rounded-md overflow-x-auto">
                <code>{challenge.exampleOutput}</code>
              </pre>
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </div>
  )
}

