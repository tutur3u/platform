"use client"

import { Badge } from "@tuturuuu/ui/badge"
import { Card } from "@tuturuuu/ui/card"
import {
  Bot,
  BrainCircuit,
  LineChart,
  Lock,
  MessageSquareCode,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "@tuturuuu/ui/icons"
import { motion } from "framer-motion"
import { useTranslations } from "next-intl"
import InteractiveDemo from "./interactive-demo"

export default function AiFeatures() {
  const t = useTranslations("nova")

  const features = [
    {
      icon: <BrainCircuit className="h-5 w-5" />,
      title: t("advanced-ai-models"),
      description: t("advanced-ai-models-description"),
      gradient: "from-blue-500/20 to-magenta-500/20",
      iconBg: "from-blue-500 to-indigo-600",
    },
    {
      icon: <MessageSquareCode className="h-5 w-5" />,
      title: t("smart-templates"),
      description: t("smart-templates-description"),
      gradient: "from-magenta-500/20 to-blue-500/20",
      iconBg: "from-indigo-500 to-purple-600",
    },
    {
      icon: <LineChart className="h-5 w-5" />,
      title: t("performance-analytics"),
      description: t("performance-analytics-description"),
      gradient: "from-purple-500/20 to-blue-500/20",
      iconBg: "from-purple-500 to-blue-600",
    },
    {
      icon: <Settings2 className="h-5 w-5" />,
      title: t("fine-tune-controls"),
      description: t("fine-tune-controls-description"),
      gradient: "from-blue-500/20 to-purple-500/20",
      iconBg: "from-blue-500 to-purple-600",
    },
    {
      icon: <Lock className="h-5 w-5" />,
      title: t("secure-processes"),
      description: t("secure-processes-description"),
      gradient: "from-blue-500/20 to-purple-500/20",
      iconBg: "from-indigo-500 to-purple-600",
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: t("ethical-ai"),
      description: t("ethical-ai-description"),
      gradient: "from-blue-500/20 to-indigo-500/20",
      iconBg: "from-blue-500 to-indigo-600",
    },
  ]

  return (
    <section id="ai" className="relative w-full py-24">
      <div className="relative mx-auto max-w-6xl px-4">
        <div className="mb-16 text-center">
          <Badge
            variant="outline"
            className="border-primary/30 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-primary backdrop-blur-sm mb-4 inline-flex items-center gap-1"
          >
            <Bot className="h-4 w-4" />
            {t("ai-capabilities")}
          </Badge>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
            {t("ai-capabilities-subtitle")}
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">{t("ai-capabilities-description")}</p>
        </div>

        <div className="mb-16 grid gap-8 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <div className="grid gap-4 sm:grid-cols-2">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  className="group"
                >
                  <Card className="border-primary/20 bg-gradient-to-br from-white/50 to-gray-50/30 dark:from-gray-900/50 dark:to-gray-800/30 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 relative overflow-hidden transition-all duration-300 backdrop-blur-sm">
                    <div className="relative z-10 p-6">
                      <div
                        className={`bg-gradient-to-r ${feature.iconBg} text-white mb-3 w-fit rounded-full p-2 shadow-md`}
                      >
                        {feature.icon}
                      </div>
                      <h3 className="mb-1 font-semibold text-foreground">{feature.title}</h3>
                      <p className="text-muted-foreground text-sm">{feature.description}</p>
                    </div>

                    {/* Animated gradient background */}
                    <motion.div
                      className={`bg-gradient-to-br absolute inset-0 -z-10 ${feature.gradient} opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100`}
                      animate={{
                        scale: [1, 1.1, 1],
                        rotate: [0, 2, 0],
                      }}
                      transition={{
                        duration: 8,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: "linear",
                      }}
                    />
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative min-h-[600px]"
          >
            <InteractiveDemo />

            {/* Decorative elements */}
            <motion.div
              className="absolute -right-12 -top-12 h-24 w-24"
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, 90, 0],
              }}
              transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY }}
            >
              <div className="bg-gradient-to-br from-blue-400/10 to-purple-400/10 dark:from-blue-400/20 dark:to-purple-400/20 h-full w-full rounded-full blur-3xl" />
            </motion.div>

            <motion.div
              className="absolute -bottom-8 -left-8 h-32 w-32"
              animate={{
                scale: [1, 1.2, 1],
                rotate: [0, -90, 0],
              }}
              transition={{ duration: 15, repeat: Number.POSITIVE_INFINITY }}
            >
              <div className="bg-gradient-to-br from-purple-400/10 to-pink-400/10 dark:from-purple-400/20 dark:to-pink-400/20 h-full w-full rounded-full blur-3xl" />
            </motion.div>
          </motion.div>
        </div>

        {/* Enhanced Magic Wand Feature highlight */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-xl border border-primary/20 backdrop-blur-sm"
        >
          {/* Blue to purple gradient background */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-700 dark:to-purple-700 absolute inset-0" />

          {/* Sparkling effects around border */}
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-1 w-1 rounded-full bg-white/60"
              style={{
                top: i < 6 ? "0%" : "100%",
                left: `${(i % 6) * 20}%`,
                right: i >= 6 ? `${((i - 6) % 6) * 20}%` : "auto",
              }}
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [0.8, 1.5, 0.8],
                y: i < 6 ? [-2, 2, -2] : [2, -2, 2],
              }}
              transition={{
                duration: 2,
                repeat: Number.POSITIVE_INFINITY,
                delay: i * 0.2,
              }}
            />
          ))}

          {/* Corner sparkles */}
          {[
            { top: "10px", left: "10px" },
            { top: "10px", right: "10px" },
            { bottom: "10px", left: "10px" },
            { bottom: "10px", right: "10px" },
          ].map((position, i) => (
            <motion.div
              key={i}
              className="absolute"
              style={position}
              animate={{
                rotate: [0, 180, 360],
                scale: [0.8, 1.2, 0.8],
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 3,
                repeat: Number.POSITIVE_INFINITY,
                delay: i * 0.5,
              }}
            >
              <Sparkles className="h-3 w-3 text-white/80" />
            </motion.div>
          ))}

          {/* Internal sparkles with vertical movement */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={`internal-${i}`}
              className="absolute h-1 w-1 rounded-full bg-white/40"
              style={{
                top: `${20 + Math.random() * 60}%`,
                left: `${10 + Math.random() * 80}%`,
              }}
              animate={{
                y: [-10, 10, -10],
                opacity: [0.2, 0.8, 0.2],
                scale: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 2 + Math.random() * 2,
                repeat: Number.POSITIVE_INFINITY,
                delay: Math.random() * 2,
              }}
            />
          ))}

          <div className="relative z-10 p-8">
            <div className="flex items-center gap-4">
              <motion.div
                className="bg-white/20 text-white rounded-full p-3 backdrop-blur-sm shadow-lg"
                animate={{
                  boxShadow: [
                    "0 0 20px rgba(255, 255, 255, 0.3)",
                    "0 0 30px rgba(255, 255, 255, 0.5)",
                    "0 0 20px rgba(255, 255, 255, 0.3)",
                  ],
                }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
              >
                <Wand2 className="h-6 w-6" />
              </motion.div>
              <div>
                <h3 className="text-xl font-bold text-white">{t("magic-commands")}</h3>
                <p className="text-white/80">{t("magic-commands-description")}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
              {["commands.story" as const, "commands.analyze" as const, "commands.improve" as const].map(
                (command, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.05 }}
                    className="bg-white/10 border-white/20 text-white rounded-lg border p-3 font-mono backdrop-blur-sm hover:bg-white/20 transition-all duration-200"
                  >
                    {t(command)}
                  </motion.div>
                ),
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
