"use client"

import { Button } from "@tuturuuu/ui/button"
import { Card } from "@tuturuuu/ui/card"
import { Bot, MessageSquare, Send, Sparkles, User } from "@tuturuuu/ui/icons"
import { motion, useAnimation } from "framer-motion"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

type DemoMessageKey = "title" | "badge" | "input1" | "response1" | "input2" | "response2"

interface Message {
  role: "user" | "assistant"
  content: DemoMessageKey
}

export default function InteractiveDemo() {
  const [messages, setMessages] = useState<Message[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const controls = useAnimation()
  const t = useTranslations("nova.interactive-demo")

  const demoConversation: Message[] = [
    {
      role: "user",
      content: "input1",
    },
    {
      role: "assistant",
      content: "response1",
    },
    {
      role: "user",
      content: "input2",
    },
    {
      role: "assistant",
      content: "response2",
    },
  ]

  useEffect(() => {
    if (currentStep < demoConversation.length) {
      const timer = setTimeout(() => {
        const newMessage = demoConversation[currentStep]
        if (newMessage) {
          setMessages((prev) => [...prev, newMessage])
          setCurrentStep((prev) => prev + 1)
          controls.start({ opacity: 1, y: 0 })
        }
      }, 2000)

      return () => clearTimeout(timer)
    }
  }, [currentStep, controls])

  return (
    <div className="relative">
      {/* Enhanced decorative elements */}
      <div className="from-primary/5 via-blue-500/10 to-purple-500/10 bg-linear-to-b absolute inset-0 rounded-xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_0%,rgba(var(--primary-rgb),0.15),transparent)]" />

      {/* Animated floating particles */}
      {[...Array(15)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 opacity-60"
          style={{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -20, 0],
            x: [0, Math.random() * 10 - 5, 0],
            opacity: [0.2, 0.8, 0.2],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{
            duration: 3 + Math.random() * 3,
            repeat: Number.POSITIVE_INFINITY,
            delay: Math.random() * 2,
          }}
        />
      ))}

      <div className="relative mx-auto max-w-3xl">
        <Card className="border-primary/20 bg-gradient-to-br from-white/80 via-blue-50/30 to-purple-50/30 dark:from-gray-900/80 dark:via-blue-900/20 dark:to-purple-900/20 overflow-hidden backdrop-blur-md shadow-lg shadow-primary/10">
          {/* Demo header with enhanced gradient */}
          <div className="border-primary/10 bg-gradient-to-r from-blue-500/80 via-primary/80 to-purple-500/80 flex items-center gap-2 border-b p-4 text-white">
            <motion.div
              animate={{
                rotate: [0, 10, -10, 0],
                scale: [1, 1.1, 1],
              }}
              transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
            >
              <Bot className="h-5 w-5" />
            </motion.div>
            <span className="font-semibold">{t("title")}</span>
            <span className="bg-white/20 text-white ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-xs backdrop-blur-sm">
              <motion.div
                animate={{
                  rotate: [0, 180, 360],
                  scale: [1, 1.2, 1],
                }}
                transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY }}
              >
                <Sparkles className="h-3 w-3" />
              </motion.div>
              {t("badge")}
            </span>
          </div>

          {/* Messages container with enhanced styling */}
          <div className="h-[400px] space-y-4 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex items-start gap-3 ${message.role === "assistant" ? "flex-row" : "flex-row-reverse"}`}
              >
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className={`rounded-full p-2 ${
                    message.role === "assistant"
                      ? "bg-gradient-to-br from-blue-500 to-primary text-white"
                      : "bg-gradient-to-br from-purple-500 to-pink-500 text-white"
                  }`}
                >
                  {message.role === "assistant" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.02 }}
                  className={`max-w-[80%] rounded-lg ${
                    message.role === "assistant"
                      ? "bg-gradient-to-r from-blue-100/80 to-primary/10 dark:from-blue-900/30 dark:to-primary/20 border border-blue-200/30 dark:border-blue-700/30"
                      : "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                  } p-3 shadow-md`}
                >
                  <p className="text-sm">{t(message.content)}</p>
                </motion.div>
              </motion.div>
            ))}
            {currentStep < demoConversation.length && (
              <div className="text-muted-foreground flex items-center gap-2">
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Number.POSITIVE_INFINITY,
                  }}
                  className="bg-gradient-to-r from-blue-400 to-primary h-2 w-2 rounded-full"
                />
                <span className="text-sm">
                  {demoConversation[currentStep]?.role === "assistant" ? t("ai-typing") : t("user-typing")}
                </span>
              </div>
            )}
          </div>

          {/* Input area with enhanced styling */}
          <div className="border-primary/10 bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-900/20 dark:to-purple-900/20 flex items-center gap-2 border-t p-4 backdrop-blur-sm">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={t("input-place-holder")}
                className="border-primary/20 bg-white/80 dark:bg-gray-800/80 placeholder:text-muted-foreground focus:ring-primary/30 w-full rounded-lg border px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2 backdrop-blur-sm"
                disabled
              />
              <MessageSquare className="text-primary absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            </div>
            <Button
              size="icon"
              disabled
              className="bg-gradient-to-r from-blue-500 to-primary hover:from-blue-600 hover:to-primary/90 text-white"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          {/* Decorative corner elements */}
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-bl-full"></div>
          <div className="absolute bottom-0 left-0 w-16 h-16 bg-gradient-to-tr from-blue-400/10 to-purple-400/10 rounded-tr-full"></div>
        </Card>
      </div>
    </div>
  )
}
