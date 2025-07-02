"use client"

import type { Workspace } from "@tuturuuu/types/db"
import { Badge } from "@tuturuuu/ui/badge"
import { Button } from "@tuturuuu/ui/button"
import { Card } from "@tuturuuu/ui/card"
import { GetStartedButton } from "@tuturuuu/ui/custom/get-started-button"
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle,
  GraduationCap,
  MessageSquare,
  RocketIcon,
  School,
  Sparkles,
  Users,
  Video
} from "@tuturuuu/ui/icons"
import { Separator } from "@tuturuuu/ui/separator"
import { type Variants, motion } from "framer-motion"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { notFound } from "next/navigation"
import { useEffect, useState } from "react"
import GradientHeadline from "../gradient-headline"
import AiFeatures from "./ai-features"
import { GeometricBackground } from "./geometric-background"
import { TestimonialsSection } from "./testimonial"
export default function MarketingPage() {
  const t = useTranslations("boarding-pages.home")
  // Fetch workspaces from the API
  const [wsId, setWsId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchWsId() {
      const workspaces = await getWorkspaces()
      setWsId(workspaces?.[0]?.id || null)
    }
    fetchWsId()
  }, [])
  // Enhanced floating effect variants with reduced movement for better performance
  const floatingVariants = {
    initial: { y: 0 },
    float: {
      y: [-8, 8],
      transition: {
        duration: 5,
        repeat: Number.POSITIVE_INFINITY,
        repeatType: "mirror",
        ease: "easeInOut",
      },
    },
  } as Variants

  return (
    <>
      {/* <HeroAnimation /> */}
      <div className="relative flex h-full min-h-screen w-full flex-col items-center will-change-transform">
        <section id="hero" className="relative w-full overflow-hidden">
          {/* Blue to Purple Gradient Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-purple-800 dark:from-blue-900 dark:via-purple-900 dark:to-indigo-950" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent dark:from-black/40 dark:to-transparent" />

          {/* Gradient blend to background */}
          <div className="absolute bottom-0 left-0 right-0 h-29 bg-gradient-to-t from-background to-transparent" />

          <div className="relative mx-auto max-w-7xl px-4 py-24 sm:py-32">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              {/* Left side - Hero content */}
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
                className="space-y-8"
              >
                <motion.div variants={floatingVariants} initial="initial" animate="float" className="relative">
                  <Badge
                    variant="outline"
                    className="group relative mb-8 overflow-hidden border-white/20 bg-white/10 text-white backdrop-blur-sm dark:border-white/30 dark:bg-white/20"
                  >
                    <motion.div
                      className="absolute inset-0 bg-white/10 opacity-100 transition-opacity"
                      whileHover={{ opacity: 1 }}
                    />
                    <Sparkles className="mr-2 h-4 w-4" />
                    <span className="relative z-10">{t("hero.badge")}</span>
                  </Badge>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                  className="text-balance text-4xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl"
                >
                  {t("hero.title-1")}
                  <br />
                  <GradientHeadline title={t("hero.title-2")} />
                </motion.h1>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.8 }}
                  className="max-w-xl text-balance text-lg text-white/80"
                >
                  {t("hero.description")}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.8 }}
                  className="flex flex-col items-start gap-4 sm:flex-row"
                >
                  <motion.div whileHover={{ scale: 1.05, y: -2 }} transition={{ type: "spring", stiffness: 400 }}>
                    <GetStartedButton
                      text={t("common.get-started")}
                      href={wsId ? `/${wsId}/home` : "/onboarding"}
                      disabled={!wsId && wsId !== null}
                    />
                  </motion.div>
                  <motion.div
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400 }}
                  >
                    <Link href="/courses">
                      <Button
                        variant="outline"
                        className="group relative overflow-hidden border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 dark:border-white/30 dark:bg-white/20 dark:hover:bg-white/30"
                      >
                        <motion.span
                          className="absolute inset-0 bg-white/10"
                          initial={{ x: "-100%" }}
                          whileHover={{ x: "100%" }}
                          transition={{ duration: 0.5 }}
                        />
                        <span className="relative z-10 flex items-center">
                          {t("hero.explore-courses")}
                          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </span>
                      </Button>
                    </Link>
                  </motion.div>
                </motion.div>
              </motion.div>

              {/* Right side - Futuristic classroom image */}
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.8 }}
                className="relative"
              >
                <div className="relative">
                  {/* Floating animation for the image */}
                  <motion.div
                    animate={{
                      y: [-10, 10, -10],
                    }}
                    transition={{
                      duration: 6,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeInOut",
                    }}
                    className="relative"
                  >
                    <img
                      src="/futuristic-classroom.png"
                      alt="Futuristic classroom with students learning using AI and high-tech equipment"
                      className="w-full h-auto max-w-2xl mx-auto drop-shadow-2xl"
                    />
                  </motion.div>

                  {/* Decorative elements */}
                  <motion.div
                    animate={{
                      rotate: [0, 360],
                    }}
                    transition={{
                      duration: 20,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "linear",
                    }}
                    className="absolute -top-4 -right-4 h-8 w-8 rounded-full bg-gradient-to-r from-pink-400 to-purple-400 opacity-60"
                  />
                  <motion.div
                    animate={{
                      rotate: [360, 0],
                    }}
                    transition={{
                      duration: 15,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "linear",
                    }}
                    className="absolute -bottom-6 -left-6 h-12 w-12 rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 opacity-40"
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Content sections with geometric background */}
        <div className="relative w-full">
          <GeometricBackground />

          {/* Key Features Section */}
          <section id="features" className="relative w-full py-24">
            <div className="mx-auto max-w-6xl px-4">
              <div className="mb-16 text-center">
                <Badge
                  variant="outline"
                  className="mb-4 border-primary/30 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-primary backdrop-blur-sm"
                >
                  {t("key-features.badge")}
                </Badge>
                <h2 className="mb-4 text-3xl font-bold md:text-4xl bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                  {t("key-features.title")}
                </h2>
                <p className="text-muted-foreground">{t("key-features.description")}</p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    icon: <Video className="h-6 w-6" />,
                    title: t("key-features.feature-1.title"),
                    description: t("key-features.feature-1.description"),
                    gradient: "from-blue-500/20 via-primary/20 to-indigo-500/20",
                    iconGradient: "from-purple-500 to-indigo-600",
                  },
                  {
                    icon: <Brain className="h-6 w-6" />,
                    title: t("key-features.feature-2.title"),
                    description: t("key-features.feature-2.description"),
                    gradient: "from-purple-500/20 via-primary/20 to-blue-500/20",
                    iconGradient: "from-purple-500 to-blue-600",
                  },
                  {
                    icon: <MessageSquare className="h-6 w-6" />,
                    title: t("key-features.feature-3.title"),
                    description: t("key-features.feature-3.description"),
                    gradient: "from-blue-500/20 via-primary/20 to-cyan-500/20",
                    iconGradient: "from-purple-500 to-indigo-600",
                  },
                  {
                    icon: <BookOpen className="h-6 w-6" />,
                    title: t("key-features.feature-4.title"),
                    description: t("key-features.feature-4.description"),
                    gradient: "from-indigo-500/20 via-primary/20 to-blue-500/20",
                    iconGradient: "from-indigo-500 to-blue-600",
                  },
                  {
                    icon: <Users className="h-6 w-6" />,
                    title: t("key-features.feature-5.title"),
                    description: t("key-features.feature-5.description"),
                    gradient: "from-purple-500/20 via-primary/20 to-indigo-500/20",
                    iconGradient: "from-purple-500 to-indigo-600",
                  },
                  {
                    icon: <School className="h-6 w-6" />,
                    title: t("key-features.feature-6.title"),
                    description: t("key-features.feature-6.description"),
                    gradient: "from-blue-500/20 via-primary/20 to-indigo-500/20",
                    iconGradient: "from-blue-500 to-indigo-600",
                  },
                ].map((feature, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.02 }}
                    className="group"
                  >
                    <Card className="border-primary/20 bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-950/30 dark:to-purple-950/30 relative h-full overflow-hidden backdrop-blur-sm hover:shadow-lg hover:shadow-primary/10 transition-all duration-300">
                      <div className="relative z-10 flex h-full flex-col space-y-4 p-6">
                        <div className="flex items-center gap-4">
                          <div
                            className={`bg-gradient-to-r ${feature.iconGradient} text-white rounded-full p-3 shadow-lg`}
                          >
                            {feature.icon}
                          </div>
                        </div>
                        <h3 className="text-xl font-bold">{feature.title}</h3>
                        <p className="text-muted-foreground">{feature.description}</p>
                      </div>

                      {/* Animated gradient background */}
                      <motion.div
                        className={`bg-gradient-to-br absolute inset-0 -z-10 ${feature.gradient} opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100`}
                        animate={{
                          scale: [1, 1.2, 1],
                          rotate: [0, 5, 0],
                        }}
                        transition={{
                          duration: 5,
                          repeat: Number.POSITIVE_INFINITY,
                          ease: "linear",
                        }}
                      />
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* For Teachers Section */}
          <section id="for-teachers" className="relative w-full py-24">
            <div className="bg-gradient-to-r from-blue-500/5 to-purple-500/5 dark:from-blue-500/10 dark:to-purple-500/10 absolute inset-0" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,rgba(59,130,246,0.1),transparent)] dark:bg-[radial-gradient(circle_500px_at_50%_50%,rgba(147,51,234,0.15),transparent)]" />

            <div className="relative mx-auto max-w-6xl px-4">
              <div className="grid gap-12 md:grid-cols-2 md:items-center">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="space-y-6"
                >
                  <Badge
                    variant="outline"
                    className="border-blue-300 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 backdrop-blur-sm"
                  >
                    {t("for-teachers.badge")}
                  </Badge>
                  <h2 className="text-3xl font-bold md:text-4xl bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                    {t("for-teachers.title")}
                  </h2>
                  <p className="text-foreground/60">{t("for-teachers.description")}</p>
                  <div className="space-y-4">
                    {[
                      t("for-teachers.details-1"),
                      t("for-teachers.details-2"),
                      t("for-teachers.details-3"),
                      t("for-teachers.details-4"),
                      t("for-teachers.details-5"),
                    ].map((item, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center gap-2"
                      >
                        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-full p-1 shadow-sm">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                        <span>{item}</span>
                      </motion.div>
                    ))}
                  </div>

                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Link href="/guide#for-teachers">
                      <Button className="mt-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg">
                        <span className="relative z-10 flex items-center gap-2">
                          {t("for-teachers.button")}
                          <RocketIcon className="h-4 w-4" />
                        </span>
                      </Button>
                    </Link>
                  </motion.div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="relative"
                >
                  <div className="bg-gradient-to-br from-white/80 to-blue-50/80 dark:from-gray-900/80 dark:to-blue-950/80 relative aspect-video rounded-xl border border-blue-200/50 dark:border-blue-800/50 backdrop-blur-sm shadow-lg shadow-blue-500/10">
                    <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 absolute inset-0 rounded-xl" />
                    <div className="relative p-8">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="grid gap-4"
                      >
                        {[
                          {
                            icon: <GraduationCap className="h-5 w-5" />,
                            title: t("for-teachers.feature-1.title"),
                            description: t("for-teachers.feature-1.description"),
                          },
                          {
                            icon: <Users className="h-5 w-5" />,
                            title: t("for-teachers.feature-2.title"),
                            description: t("for-teachers.feature-2.description"),
                          },
                          {
                            icon: <Brain className="h-5 w-5" />,
                            title: t("for-teachers.feature-3.title"),
                            description: t("for-teachers.feature-3.description"),
                          },
                        ].map((item, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="bg-gradient-to-r from-white/80 to-blue-50/80 dark:from-gray-800/80 dark:to-blue-900/80 flex items-start gap-4 rounded-lg border border-blue-200/30 dark:border-blue-800/30 p-4 backdrop-blur-sm"
                          >
                            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-full p-2 shadow-sm">
                              {item.icon}
                            </div>
                            <div>
                              <h3 className="font-semibold">{item.title}</h3>
                              <p className="text-muted-foreground text-sm">{item.description}</p>
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </section>

          {/* For Students Section */}
          <section id="for-students" className="relative w-full py-24">
            <div className="mx-auto max-w-6xl px-4">
              <div className="grid gap-12 md:grid-cols-2 md:items-center">
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="order-1 space-y-6 md:order-2"
                >
                  <Badge
                    variant="outline"
                    className="border-indigo-300 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 text-indigo-600 dark:text-indigo-400 backdrop-blur-sm"
                  >
                    {t("for-students.badge")}
                  </Badge>

                  <h2 className="text-3xl font-bold md:text-4xl bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-400 dark:to-indigo-400 bg-clip-text text-transparent">
                    {t("for-students.title")}
                  </h2>

                  <p className="text-foreground/60">{t("for-students.description")}</p>

                  <div className="space-y-4">
                    {[
                      t("for-students.details-1"),
                      t("for-students.details-2"),
                      t("for-students.details-3"),
                      t("for-students.details-4"),
                      t("for-students.details-5"),
                    ].map((item, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center gap-2"
                      >
                        <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-full p-1 shadow-sm">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                        <span>{item}</span>
                      </motion.div>
                    ))}
                  </div>

                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Link href="/guide#for-students">
                      <Button className="mt-4 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-lg">
                        <span className="relative z-10 flex items-center gap-2">
                          {t("for-students.button")}
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </Button>
                    </Link>
                  </motion.div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="relative order-2 md:order-1"
                >
                  <Card className="border-indigo-200/50 dark:border-indigo-800/50 bg-gradient-to-br from-white/80 to-indigo-50/80 dark:from-gray-900/80 dark:to-indigo-950/80 overflow-hidden backdrop-blur-sm shadow-lg shadow-indigo-500/10">
                    <div className="space-y-4 p-6">
                      <h3 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-400 dark:to-indigo-400 bg-clip-text text-transparent">
                        {t("for-students.course-categories.title")}
                      </h3>
                      <Separator className="bg-gradient-to-r from-purple-200 to-indigo-200 dark:from-purple-800 dark:to-indigo-800" />
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          t("for-students.course-categories.category-1"),
                          t("for-students.course-categories.category-2"),
                          t("for-students.course-categories.category-3"),
                          t("for-students.course-categories.category-4"),
                          t("for-students.course-categories.category-5"),
                          t("for-students.course-categories.category-6"),
                        ].map((category, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.05 }}
                            className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/50 dark:to-indigo-950/50 p-2 rounded-md hover:shadow-md transition-shadow"
                          >
                            <span>{category}</span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              </div>
            </div>
          </section>


          {/* AI Features Section */}
          <div className="relative">
            <AiFeatures />
          </div>

          {/* Multilingual Support Section */}
          <section className="relative w-full py-24">
            <div className="bg-gradient-to-r from-purple-500/5 to-pink-500/5 dark:from-purple-500/10 dark:to-pink-500/10 absolute inset-0" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,rgba(168,85,247,0.1),transparent)] dark:bg-[radial-gradient(circle_500px_at_50%_50%,rgba(236,72,153,0.15),transparent)]" />

            <div className="relative mx-auto max-w-6xl px-4">
              <div className="grid gap-12 md:grid-cols-2 md:items-center">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="space-y-6"
                >
                  <Badge
                    variant="outline"
                    className="border-purple-300 bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-600 dark:text-purple-400 backdrop-blur-sm"
                  >
                    {t("multilingual-support.badge")}
                  </Badge>
                  <h2 className="text-3xl font-bold md:text-4xl bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                    {t("multilingual-support.title")}
                  </h2>
                  <p className="text-foreground/60">{t("multilingual-support.description")}</p>
                  <div className="space-y-4">
                    {[
                      t("multilingual-support.details-1"),
                      t("multilingual-support.details-2"),
                      t("multilingual-support.details-3"),
                      t("multilingual-support.details-4"),
                    ].map((item, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center gap-2"
                      >
                        <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-full p-1 shadow-sm">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                        <span>{item}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="relative"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="border-purple-200/50 dark:border-purple-800/50 bg-gradient-to-br from-white/80 to-purple-50/80 dark:from-gray-900/80 dark:to-purple-950/80 p-6 backdrop-blur-sm shadow-lg shadow-purple-500/10">
                      <div className="flex flex-col items-center text-center">
                        <h3 className="mb-2 text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                          English
                        </h3>
                        <p className="text-muted-foreground mb-4 text-sm">
                          Access our full platform and all courses in English
                        </p>
                        <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                          EN
                        </div>
                      </div>
                    </Card>
                    <Card className="border-pink-200/50 dark:border-pink-800/50 bg-gradient-to-br from-white/80 to-pink-50/80 dark:from-gray-900/80 dark:to-pink-950/80 p-6 backdrop-blur-sm shadow-lg shadow-pink-500/10">
                      <div className="flex flex-col items-center text-center">
                        <h3 className="mb-2 text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                          Tiếng Việt
                        </h3>
                        <p className="text-muted-foreground mb-4 text-sm">
                          Truy cập nền tảng và các khóa học bằng tiếng Việt
                        </p>
                        <div className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                          VI
                        </div>
                      </div>
                    </Card>
                  </div>
                </motion.div>
              </div>
            </div>
          </section>
          {/* Testimonials */}
           <TestimonialsSection />
         {/* Combined CTA and Partnership Section */}
<section className="relative w-full py-24">
  {/* Unified gradient background that adapts to theme */}
  <div className="bg-gradient-to-br from-blue-500/8 via-purple-500/6 to-blue-500/8 dark:from-blue-500/15 dark:via-purple-500/12 dark:to-blue-500/15 absolute inset-0" />
  
  <div className="relative mx-auto max-w-6xl px-4">
    {/* CTA Section Content */}
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="mx-auto max-w-4xl text-center mb-24"
    >
      <Badge
        variant="outline"
        className="mb-4 border-primary/30 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-primary backdrop-blur-sm"
      >
        <Sparkles className="mr-2 h-4 w-4" />
        {t("cta-section.badge")}
      </Badge>
      <h2 className="mb-4 text-4xl font-bold md:text-5xl bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
        {t("cta-section.title")}
      </h2>
      <p className="text-muted-foreground mb-8">{t("cta-section.description")}</p>
      <motion.div
        className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2 }}
      >
        <GetStartedButton
          text={t("common.get-started")}
          href={wsId ? `/${wsId}/home` : "/login"}
          disabled={!wsId && wsId !== null}
        />
        <Link href="/about">
          <Button
            variant="outline"
            className="group border-primary/30 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-primary hover:from-blue-500/20 hover:to-purple-500/20 backdrop-blur-sm"
          >
            {t("hero.platform-guide")}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </Link>
      </motion.div>
    </motion.div>

    {/* Partnership Section Content */}
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="text-center mb-16"
    >
      <Badge
        variant="outline"
        className="mb-4 border-purple-300/50 dark:border-purple-400/50 bg-gradient-to-r from-purple-500/10 to-blue-500/10 text-purple-600 dark:text-purple-400 backdrop-blur-sm"
      >
        {t("partners.badge")}
      </Badge>
      <h2 className="mb-4 text-3xl font-bold md:text-4xl bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
        {t("partners.title")}
      </h2>
    </motion.div>

    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 items-center justify-center">
  {Array.from({ length: 6 }).map((_, index) => (
    <motion.div
      key={index}
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1 }}
      whileHover={{ scale: 1.05 }}
      className="group mx-auto"
    >
      <Card className="border-purple-200/30 dark:border-purple-800/30 bg-gradient-to-br from-white/80 to-purple-50/30 dark:from-gray-900/80 dark:to-purple-950/30 p-6 backdrop-blur-sm hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300 flex items-center justify-center h-24">
        <img
          src="/media/logos/transparent.png"
          alt="Partner Logo"
          className="max-h-full max-w-full object-contain opacity-60 group-hover:opacity-100 transition-opacity duration-300"
        />
      </Card>
    </motion.div>
  ))}
</div>


  </div>
</section>
        </div>
      </div>
    </>
  )
}

async function getWorkspaces() {
  const response = await fetch("/api/v1/workspaces")
  if (!response.ok) notFound()

  const data = await response.json()
  return data as Workspace[]
}

