'use client'

import { useState, useEffect } from 'react'
import { ProblemDescription } from './problem-description'
import { PromptInput } from './prompt-input'
import { ResultsDisplay } from './results-display'
import { ChallengeSelection } from './challenge-selection'
import { ModelSelection } from './model-selection'
import { PerformanceMetrics } from './performance-metrics'
import { Challenge } from '@/types/challenge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Send, Sparkles } from 'lucide-react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useToast } from "@/components/ui/use-toast"

export function Playground({ initialChallenges }: { initialChallenges: Challenge[] }) {
  const [challenges] = useState<Challenge[]>(initialChallenges)
  const [currentChallenge, setCurrentChallenge] = useState<Challenge>(challenges[0])
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState('gpt-3.5-turbo')
  const [results, setResults] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [metrics, setMetrics] = useState({ tokenCount: 0, responseTime: 0 })
  const { toast } = useToast()

  const handleSubmit = async () => {
    if (prompt.trim() === '') {
      toast({
        title: "Empty Prompt",
        description: "Please enter a prompt before submitting.",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    // Simulating API call
    await new Promise(resolve => setTimeout(resolve, 2000))
    const newResult = `This is a simulated response for the prompt: "${prompt}"`
    setResults([newResult, ...results])
    setMetrics({
      tokenCount: prompt.split(' ').length * 2, // Simulated token count
      responseTime: Math.floor(Math.random() * 1000) + 500 // Simulated response time
    })
    setIsLoading(false)
  }

  const handleGeneratePrompt = () => {
    const generatedPrompt = `Here's a generated prompt for the ${currentChallenge.title} challenge: Analyze the given text and provide a concise summary highlighting the main points.`
    setPrompt(generatedPrompt)
    toast({
      title: "Prompt Generated",
      description: "A new prompt has been generated for you.",
    })
  }

  useEffect(() => {
    setPrompt('')
    setResults([])
  }, [currentChallenge])

  return (
    <div className="container mx-auto p-4 h-[calc(100vh-4rem)]">
      <div className="flex justify-between items-center mb-4">
        <ChallengeSelection
          challenges={challenges}
          currentChallenge={currentChallenge}
          onSelectChallenge={setCurrentChallenge}
        />
        <ModelSelection selectedModel={selectedModel} setSelectedModel={setSelectedModel} />
      </div>
      <ResizablePanelGroup direction="horizontal" className="min-h-[calc(100vh-8rem)] rounded-lg border">
        <ResizablePanel defaultSize={30} minSize={20}>
          <ProblemDescription challenge={currentChallenge} />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={70}>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={70} minSize={30}>
              <Card className="h-full">
                <PromptInput 
                  prompt={prompt} 
                  setPrompt={setPrompt} 
                  onSubmit={handleSubmit}
                  onGenerate={handleGeneratePrompt}
                  isLoading={isLoading}
                />
              </Card>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={30}>
              <Card className="h-full">
                <ResultsDisplay results={results} isLoading={isLoading} />
              </Card>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
      <div className="mt-4">
        <PerformanceMetrics metrics={metrics} />
      </div>
    </div>
  )
}

