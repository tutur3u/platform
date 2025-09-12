'use client'

import { createClient } from "@tuturuuu/supabase/next/client"
import type { WorkspaceUser } from "@tuturuuu/types/primitives/WorkspaceUser"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@tuturuuu/ui/alert-dialog"
import { Button } from "@tuturuuu/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@tuturuuu/ui/dialog"
import { toast } from "@tuturuuu/ui/hooks/use-toast"
import { Plus, Trash2 } from "@tuturuuu/ui/icons"
import { Input } from "@tuturuuu/ui/input"
import { Label } from "@tuturuuu/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tuturuuu/ui/select"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

interface HealthcareVital {
  id: string
  name: string
  unit: string
}

interface GroupIndicator {
  id: string
  name: string
}

interface UserIndicator {
  user_id: string
  indicator_id: string
  value: number | null
}

interface Props {
  wsId: string
  groupId: string
  users: WorkspaceUser[]
  initialGroupIndicators: GroupIndicator[]
  initialUserIndicators: UserIndicator[]
}

export default function GroupIndicatorsManager({
  wsId,
  groupId,
  users,
  initialGroupIndicators,
  initialUserIndicators,
}: Props) {
  const t = useTranslations()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [availableVitals, setAvailableVitals] = useState<HealthcareVital[]>([])

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedIndicator, setSelectedIndicator] = useState<GroupIndicator | null>(null)
  const [selectedVitalId, setSelectedVitalId] = useState<string>("")

  // Queries
  const {
    data: groupIndicators = initialGroupIndicators,
    isLoading: isLoadingGroupIndicators,
  } = useQuery({
    queryKey: ["groupIndicators", wsId, groupId],
    queryFn: async (): Promise<GroupIndicator[]> => {
      const { data, error } = await supabase
        .from("healthcare_vitals")
        .select("id, name")
        .eq("group_id", groupId)
        .order("name")

      if (error) throw error
      return (data || []) as GroupIndicator[]
    },
    initialData: initialGroupIndicators,
  })

  const {
    data: userIndicators = initialUserIndicators,
    isLoading: isLoadingUserIndicators,
  } = useQuery({
    queryKey: ["userIndicators", wsId, groupId],
    queryFn: async (): Promise<UserIndicator[]> => {
      const { data, error } = await supabase
        .from("user_indicators")
        .select("user_id, healthcare_vitals(id, name), value")
        .eq("healthcare_vitals.group_id", groupId)
        .order("user_id")
        .order("healthcare_vitals.id")

      if (error) throw error
      return (data || []) as UserIndicator[]
    },
    initialData: initialUserIndicators,
  })

  const { data: availableVitalsQueryData = [], isLoading: isLoadingAvailableVitals } = useQuery({
    queryKey: ["availableVitals", wsId],
    queryFn: async (): Promise<HealthcareVital[]> => {
      const { data, error } = await supabase
        .from("healthcare_vitals")
        .select("id, name, unit")
        .eq("ws_id", wsId)
        .is("group_id", null)
        .order("name")

      if (error) throw error
      return (data || []) as HealthcareVital[]
    },
  })

  useEffect(() => {
    setAvailableVitals(availableVitalsQueryData)
  }, [availableVitalsQueryData])

  // Remove this mapping since we now get groupIndicators directly from the query

  // Mutations
  const addIndicatorMutation = useMutation({
    mutationFn: async (vitalId: string) => {
      const { error } = await supabase
        .from("healthcare_vitals")
        .update({ group_id: groupId })
        .eq("id", vitalId)
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["groupIndicators", wsId, groupId] }),
        queryClient.invalidateQueries({ queryKey: ["availableVitals", wsId] }),
      ])
      toast({ title: "Success", description: "Indicator added successfully" })
    },
    onError: (error) => {
      console.error("Error adding indicator:", error)
      toast({ title: "Error", description: "Failed to add indicator", variant: "destructive" })
    },
  })

  const deleteIndicatorMutation = useMutation({
    mutationFn: async (indicatorId: string) => {
      const { error } = await supabase
        .from("healthcare_vitals")
        .update({ group_id: null })
        .eq("id", indicatorId)
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["groupIndicators", wsId, groupId] }),
        queryClient.invalidateQueries({ queryKey: ["userIndicators", wsId, groupId] }),
        queryClient.invalidateQueries({ queryKey: ["availableVitals", wsId] }),
      ])
      toast({ title: "Success", description: "Indicator removed successfully" })
    },
    onError: (error) => {
      console.error("Error deleting indicator:", error)
      toast({ title: "Error", description: "Failed to remove indicator", variant: "destructive" })
    },
  })

  const updateUserIndicatorValueMutation = useMutation({
    mutationFn: async ({ userId, indicatorId, numericValue }: { userId: string; indicatorId: string; numericValue: number | null }) => {
      const { error } = await supabase
        .from("user_indicators")
        .upsert({
          user_id: userId,
          indicator_id: indicatorId,
          group_id: groupId,
          value: numericValue,
        })
      if (error) throw error
    },
    onMutate: async ({ userId, indicatorId, numericValue }) => {
      await queryClient.cancelQueries({ queryKey: ["userIndicators", wsId, groupId] })
      const previous = queryClient.getQueryData<UserIndicator[]>(["userIndicators", wsId, groupId]) || []
      const updated = previous.filter((ui) => !(ui.user_id === userId && ui.indicator_id === indicatorId))
      if (numericValue !== null) {
        updated.push({ user_id: userId, indicator_id: indicatorId, value: numericValue })
      }
      queryClient.setQueryData(["userIndicators", wsId, groupId], updated)
      return { previous }
    },
    onError: (error, _variables, context) => {
      console.error("Error updating indicator value:", error)
      if (context?.previous) {
        queryClient.setQueryData(["userIndicators", wsId, groupId], context.previous)
      }
      toast({ title: "Error", description: "Failed to update indicator value", variant: "destructive" })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["userIndicators", wsId, groupId] })
    },
  })

  const addIndicator = async () => {
    if (!selectedVitalId) return
    await addIndicatorMutation.mutateAsync(selectedVitalId)
    setAddDialogOpen(false)
    setSelectedVitalId("")
  }

  const deleteIndicator = async () => {
    if (!selectedIndicator) return
    await deleteIndicatorMutation.mutateAsync(selectedIndicator.id)
    setDeleteDialogOpen(false)
    setSelectedIndicator(null)
  }

  const updateUserIndicatorValue = async (userId: string, indicatorId: string, value: string) => {
    const numericValue = value === "" ? null : parseFloat(value)
    await updateUserIndicatorValueMutation.mutateAsync({ userId, indicatorId, numericValue })
  }

  const getIndicatorValue = (userId: string, indicatorId: string) => {
    const indicator = userIndicators.find(
      ui => ui.user_id === userId && ui.indicator_id === indicatorId
    )
    return indicator?.value?.toString() || ""
  }

  const calculateAverage = (userId: string) => {
    const userValues = groupIndicators
      .map(indicator => {
        const userIndicator = userIndicators.find(
          ui => ui.user_id === userId && ui.indicator_id === indicator.id
        )
        return userIndicator?.value
      })
      .filter(value => value !== null && value !== undefined) as number[]

    if (userValues.length === 0) return "-"
    
    const average = userValues.reduce((sum, value) => sum + value, 0) / userValues.length
    return average.toPrecision(2)
  }

  const availableVitalsForAdd = availableVitals.filter(
    vital => !groupIndicators.some(indicator => indicator.id === vital.id)
  )

  const isAnyMutationPending =
    addIndicatorMutation.isPending ||
    deleteIndicatorMutation.isPending ||
    updateUserIndicatorValueMutation.isPending

  return (
    <div className="space-y-4">
      {/* Add Indicator Button */}
      <div className="flex justify-end">
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Indicator
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Indicator</DialogTitle>
              <DialogDescription>
                Select a healthcare vital to add as an indicator for this group.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vital-select">Healthcare Vital</Label>
                <Select value={selectedVitalId} onValueChange={setSelectedVitalId}>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingAvailableVitals ? "Loading..." : "Select a vital..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVitalsForAdd.map(vital => (
                      <SelectItem key={vital.id} value={vital.id}>
                        {vital.name} ({vital.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddDialogOpen(false)}
                disabled={isAnyMutationPending}
              >
                Cancel
              </Button>
              <Button
                onClick={addIndicator}
                disabled={isAnyMutationPending || !selectedVitalId}
              >
                {addIndicatorMutation.isPending ? "Adding..." : "Add Indicator"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Indicators Table */}
      <div className="overflow-x-auto rounded-lg border">
        <div className="relative">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b bg-background">
                <th className="sticky left-0 z-20 bg-background border-r px-4 py-2 text-center font-semibold">#</th>
                <th className="sticky left-12 z-20 bg-background border-r px-4 py-2 font-semibold min-w-[200px]">
                  {t("ws-users.full_name")}
                </th>
                {groupIndicators.map((indicator) => (
                  <th key={indicator.id} className="border-r px-4 py-2 font-semibold min-w-[120px]">
                    <div className="flex items-center justify-center space-x-2">
                      <button className="flex-1 hover:bg-dynamic-purple/10 hover:text-dynamic-purple rounded px-2 py-1">
                        <span className="line-clamp-1 break-all">{indicator.name}</span>
                      </button>
                      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                            onClick={() => setSelectedIndicator(indicator)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Indicator</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove "{selectedIndicator?.name}" from this group? 
                              This will also delete all associated user data for this indicator.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={isAnyMutationPending}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={deleteIndicator}
                              disabled={isAnyMutationPending}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              {deleteIndicatorMutation.isPending ? "Removing..." : "Remove"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </th>
                ))}
                <th className="sticky right-0 z-20 bg-background border-l px-4 py-2 font-semibold min-w-[100px]">
                  {t("common.average")}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.id} className="border-b hover:bg-muted/50">
                  <td className="sticky left-0 z-10 bg-background border-r px-4 py-2 text-center">{index + 1}</td>
                  <td className="sticky left-12 z-10 bg-background border-r px-4 py-2">
                    <span className="line-clamp-1 break-all">{user.full_name}</span>
                  </td>
                  {groupIndicators.map((indicator) => (
                    <td key={indicator.id} className="border-r px-4 py-2 text-center">
                      <Input
                        type="number"
                        step="0.01"
                        value={getIndicatorValue(user.id, indicator.id)}
                        onChange={(e) => updateUserIndicatorValue(user.id, indicator.id, e.target.value)}
                        className="w-20 h-8 text-center"
                        placeholder="-"
                      />
                    </td>
                  ))}
                  <td className="sticky right-0 z-10 bg-background border-l px-4 py-2 text-center">
                    <span className="font-medium">{calculateAverage(user.id)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {groupIndicators.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No indicators added to this group yet.</p>
          <p className="text-sm">Click "Add Indicator" to get started.</p>
        </div>
      )}
    </div>
  )
}
