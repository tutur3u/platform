import { getWorkspaceQuizColumns } from "./columns"
import { CustomDataTable } from "@/components/custom-data-table"
import { createClient } from "@tuturuuu/supabase/next/server"
import type { WorkspaceQuiz, WorkspaceQuizSet } from "@tuturuuu/types/db"
import { Button } from "@tuturuuu/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tuturuuu/ui/card"
import { Badge } from "@tuturuuu/ui/badge"
import { getTranslations } from "next-intl/server"
import { Calendar, FileText, Settings, CheckCircle, XCircle, Plus, Edit, BarChart3, Timer, Target } from "lucide-react"
import Link from "next/link"

interface SearchParams {
  q?: string
  page?: string
  pageSize?: string
  includedTags?: string | string[]
  excludedTags?: string | string[]
}

interface Props {
  params: Promise<{
    wsId: string
    setId: string
  }>
  searchParams: Promise<SearchParams>
}

export default async function WorkspaceQuizzesPage({ params, searchParams }: Props) {
  const t = await getTranslations()
  const { wsId, setId } = await params

  const [quizData, quizSetData] = await Promise.all([getQuizData(setId, await searchParams), getQuizSetData(setId)])

  const { data: quizzes, count: quizCount } = quizData
  const quizSet = quizSetData
  console.log("Quiz Set Data:", quizSet)

  if (!quizSet) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-primary mb-2">Quiz Set Not Found</h2>
          <p className="text-secondary-foreground">The requested quiz set could not be found.</p>
        </div>
      </div>
    )
  }

  const isActive = new Date() >= new Date(quizSet.available_date) && new Date() <= new Date(quizSet.due_date)
  const isUpcoming = new Date() < new Date(quizSet.available_date)
  const isExpired = new Date() > new Date(quizSet.due_date)

  const getStatusInfo = () => {
    if (isUpcoming)
      return { status: "ws-quizzes.quiz-status.upcoming", color: "bg-dynamic-blue", textColor: "text-dynamic-light-blue", bgColor: "bg-dynamic-blue/20" }
    if (isActive)
      return { status: "ws-quizzes.quiz-status.active", color: "bg-dynamic-green", textColor: "text-dynamic-light-green", bgColor: "bg-dynamic-green/20" }
    if (isExpired) return { status: "ws-quizzes.quiz-status.expired", color: "bg-dynamic-light-pink", textColor: "text-dynamic-light-pink", bgColor: "bg-dynamic-pink/20" }
    return { status: "ws-quizzes.quiz-status.draft", color: "bg-muted", textColor: "text-muted-foreground", bgColor: "bg-muted/20" }
  }

  const statusInfo = getStatusInfo()

  const getExplanationModeText = (mode: number) => {
    switch (mode) {
      case 0:
        return "ws-quiz-sets.form-fields.explanation_mode.select_never"
      case 1:
        return "ws-quiz-sets.form-fields.explanation_mode.select_correct_answer"
      case 2:
        return "ws-quiz-sets.form-fields.explanation_mode.select_all_answer"
      default:
        return "Unknown"
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-dynamic-light-purple">{quizSet.name}</h1>
              <Badge className={`${statusInfo.bgColor} ${statusInfo.textColor} border-0`}>
                <div className={`w-2 h-2 rounded-full ${statusInfo.color} mr-2`} />
                {t(statusInfo.status)}
              </Badge>
            </div>
            <p className="text-secondary-foreground max-w-2xl">
              Manage and monitor your quiz set with {quizCount} question{quizCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 grid-cols-1">
            <Link className="md:col-span-2" href={`/${wsId}/quiz-sets/${setId}/edit-set`}>
              <Button className="w-full bg-dynamic-purple/20 hover:bg-dynamic-purple/40 text-primary">
                <Edit className="h-4 w-4 mr-2" />
                {t("ws-quiz-sets.edit")}
              </Button>
            </Link>
            <Link href={`/${wsId}/quiz-sets/${setId}/quiz-create`}>
              <Button className="w-full lg:w-fit bg-dynamic-purple hover:bg-dynamic-purple/90 text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" />
                {t("ws-quizzes.create_multiple")}
              </Button>
            </Link>
            <Link href={`/${wsId}/quiz-sets/${setId}/quiz-edit`}>
              <Button
                variant="outline"
                className="w-full lg:w-fit border-dynamic-purple text-dynamic-purple hover:bg-dynamic-purple/10"
              >
                <Edit className="h-4 w-4 mr-2" />
                {t("ws-quizzes.edit_all")}
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-dynamic-purple/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-secondary-foreground">Total Questions</p>
                  <p className="text-3xl font-bold text-dynamic-purple">{quizCount}</p>
                </div>
                <FileText className="h-8 w-8 text-dynamic-purple/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-dynamic-purple/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-secondary-foreground">Attempt Limit</p>
                  <p className="text-3xl font-bold text-dynamic-purple">{quizSet.attempt_limit || "∞"}</p>
                </div>
                <Target className="h-8 w-8 text-dynamic-purple/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-dynamic-purple/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-secondary-foreground">Time Limit</p>
                  <p className="text-3xl font-bold text-dynamic-purple">
                    {quizSet.time_limit_minutes ? `${quizSet.time_limit_minutes}m` : "∞"}
                  </p>
                </div>
                <Timer className="h-8 w-8 text-dynamic-purple/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-dynamic-purple/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-secondary-foreground">Status</p>
                  <p className={`text-lg font-semibold ${statusInfo.textColor}`}>{t(statusInfo.status)}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-dynamic-purple/60" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quiz Set Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Schedule Information */}
          <Card className="border-dynamic-purple/20 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-dynamic-purple/10 to-dynamic-light-purple/20">
              <CardTitle className="flex items-center gap-2 text-dynamic-purple">
                <Calendar className="h-5 w-5" />
                Schedule
              </CardTitle>
              <CardDescription>Quiz availability and deadlines</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-secondary-foreground">Available From</span>
                <span className="text-sm text-primary">
                  {new Date(quizSet.available_date).toLocaleDateString()} at{" "}
                  {new Date(quizSet.available_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-secondary-foreground">Due Date</span>
                <span className="text-sm text-primary">
                  {new Date(quizSet.due_date).toLocaleDateString()} at{" "}
                  {new Date(quizSet.due_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Settings Overview */}
          <Card className="border-dynamic-purple/20 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-dynamic-purple/10 to-dynamic-light-purple/20">
              <CardTitle className="flex items-center gap-2 text-dynamic-purple">
                <Settings className="h-5 w-5" />
                Settings
              </CardTitle>
              <CardDescription>Quiz configuration and rules</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-secondary-foreground">Explanation Mode</span>
                <span className="text-sm text-primary text-right">{t(getExplanationModeText(quizSet.explanation_mode))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-secondary-foreground">View Results</span>
                {quizSet.allow_view_results ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-secondary-foreground">Results Released</span>
                {quizSet.results_released ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-secondary-foreground">View Old Attempts</span>
                {quizSet.allow_view_old_attempts ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card className="border-dynamic-purple/20 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-dynamic-purple/10 to-dynamic-light-purple/20">
              <CardTitle className="flex items-center gap-2 text-dynamic-purple">
                <FileText className="h-5 w-5" />
                Instructions
              </CardTitle>
              <CardDescription>Student guidelines and information</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              {quizSet.instruction ? (
                <div className="prose prose-sm max-w-none">
                  <div className="text-sm text-secondary-foreground p-3 rounded-lg">
                    {typeof quizSet.instruction === "string"
                      ? quizSet.instruction
                      : JSON.stringify(quizSet.instruction, null, 2)}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-primary mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No instructions provided</p>
                  <Button variant="outline" size="sm" className="mt-2">
                    Add Instructions
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Questions List */}
        <Card className="border-dynamic-purple/20 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-dynamic-purple/10 to-dynamic-light-purple/20">
            <CardTitle className="flex items-center gap-2 text-dynamic-purple">
              <FileText className="h-5 w-5" />
              Quiz Questions
            </CardTitle>
            <CardDescription>Manage individual questions and their settings</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {quizCount > 0 ? (
              <CustomDataTable
                data={quizzes}
                columnGenerator={getWorkspaceQuizColumns}
                namespace="quiz-data-table"
                count={quizCount}
                defaultVisibility={{
                  id: false,
                  created_at: false,
                }}
              />
            ) : (
              <div className="text-center py-12">
                <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-primary mb-2">No Questions Yet</h3>
                <p className="text-secondary-foreground mb-6">Get started by adding your first quiz question.</p>
                <Link href={`/${wsId}/quiz-sets/${setId}/quiz-create`}>
                  <Button className="bg-dynamic-purple hover:bg-dynamic-purple/90 text-primary-foreground">
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Question
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

async function getQuizData(
  setId: string,
  {
    q,
    page = "1",
    pageSize = "10",
    retry = true,
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {},
) {
  const supabase = await createClient()

  const queryBuilder = supabase
    .from("quiz_set_quizzes")
    .select("...workspace_quizzes(*, quiz_options(*))", {
      count: "exact",
    })
    .eq("set_id", setId)
    .order("created_at", { ascending: false })

  if (q) queryBuilder.ilike("name", `%${q}%`)

  if (page && pageSize) {
    const parsedPage = Number.parseInt(page)
    const parsedSize = Number.parseInt(pageSize)
    const start = (parsedPage - 1) * parsedSize
    const end = parsedPage * parsedSize
    queryBuilder.range(start, end).limit(parsedSize)
  }

  const { data, error, count } = await queryBuilder
  if (error) {
    if (!retry) throw error
    return getQuizData(setId, { q, pageSize, retry: false })
  }

  return { data, count } as { data: WorkspaceQuiz[]; count: number }
}

async function getQuizSetData(setId: string) {
  const supabase = await createClient()

  // Try to get moduleId via join if possible
  const { data, error } = await supabase
    .from("workspace_quiz_sets")
    .select("*")
    .eq("id", setId)
    .single()

  if (error) {
    console.error("Error fetching quiz set:", error)
    return null
  }

  return data as WorkspaceQuizSet
}
