"use client"

import type React from "react"

import { Button } from "@tuturuuu/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@tuturuuu/ui/dialog"
import { Input } from "@tuturuuu/ui/input"
import { Label } from "@tuturuuu/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tuturuuu/ui/select"
import { Textarea } from "@tuturuuu/ui/textarea"
import { cn } from "@tuturuuu/utils/format"
import { AlertTriangle, X, Upload, CheckCircle, AlertCircle } from "@tuturuuu/ui/icons"
import { toast } from "@tuturuuu/ui/sonner"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import { z } from "zod"

interface ReportProblemFormData {
  product: string
  suggestion: string
  images: File[]
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB

// Zod schema for form validation
const reportProblemSchema = z.object({
  product: z.string().min(1, "Please select a product"),
  suggestion: z
    .string()
    .trim()
    .min(1, "Please describe the issue or suggestion")
    .max(1000, "Suggestion must be at most 1000 characters"),
  images: z
    .array(z.instanceof(File))
    .max(5, "You can upload up to 5 images")
    .refine((files) => files.every((f) => f.type.startsWith("image/")), {
      message: "Only image files are allowed",
    })
    .refine((files) => files.every((f) => f.size <= MAX_IMAGE_SIZE), {
      message: "Each image must be 10MB or less",
    }),
})

interface ReportProblemDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSubmit?: (data: ReportProblemFormData) => void
  products?: Array<{ value: string; label: string }>
  className?: string
  trigger?: React.ReactNode
  showTrigger?: boolean
}

const DEFAULT_PRODUCTS = [
  { value: "web", label: "Web Dashboard" },
  { value: "nova", label: "Nova" },
  { value: "rewise", label: "Rewise" },
  { value: "calendar", label: "Calendar" },
  { value: "finance", label: "Finance" },
  { value: "tudo", label: "Tudo" },
  { value: "tumeet", label: "Tumeet" },
  { value: "shortener", label: "URL Shortener" },
  { value: "playground", label: "Playground" },
  { value: "external", label: "External Apps" },
  { value: "other", label: "Other" },
]

const LOCAL_STORAGE_KEY = "report-problem-form-data"

export function ReportProblemDialog({
  open,
  onOpenChange,
  onSubmit,
  products = DEFAULT_PRODUCTS,
  className,
  trigger,
  showTrigger = true,
}: ReportProblemDialogProps) {
  const t = useTranslations("common")
  const [formData, setFormData] = useState<ReportProblemFormData>({
    product: "",
    suggestion: "",
    images: [],
  })
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationErrors, setValidationErrors] = useState<{
    product?: string
    suggestion?: string
    images?: string
  }>({})
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Load form data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        setFormData({
          product: parsed.product || "",
          suggestion: parsed.suggestion || "",
          images: [], // Don't restore files from localStorage
        })
      } catch (error) {
        console.error("Failed to parse saved form data:", error)
      }
    }
  }, [])

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    const dataToSave = {
      product: formData.product,
      suggestion: formData.suggestion,
      // Don't save files to localStorage
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave))
  }, [formData.product, formData.suggestion])

  const validateForm = () => {
    const result = reportProblemSchema.safeParse(formData)
    if (result.success) {
      setValidationErrors({})
      return true
    }

    const fieldErrors: { product?: string; suggestion?: string; images?: string } = {}
    for (const issue of result.error.issues) {
      if (issue.path[0] === "product" && !fieldErrors.product) {
        fieldErrors.product = issue.message
      }
      if (issue.path[0] === "suggestion" && !fieldErrors.suggestion) {
        fieldErrors.suggestion = issue.message
      }
      if (issue.path[0] === "images" && !fieldErrors.images) {
        fieldErrors.images = issue.message
      }
    }
    setValidationErrors(fieldErrors)
    return false
  }

  const handleProductChange = (value: string) => {
    setFormData((prev) => ({ ...prev, product: value }))
    if (validationErrors.product) {
      setValidationErrors((prev) => ({ ...prev, product: undefined }))
    }
  }

  const handleSuggestionChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, suggestion: event.target.value }))
    if (validationErrors.suggestion && event.target.value.trim()) {
      setValidationErrors((prev) => ({ ...prev, suggestion: undefined }))
    }
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)

    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"))

    if (files.length > 0) {
      processImageFiles(files)
    }
  }

  const processImageFiles = (files: File[]) => {
    // Filter invalid files by type/size
    const validFiles = files.filter((file) => file.type.startsWith("image/") && file.size <= MAX_IMAGE_SIZE)
    const rejectedCount = files.length - validFiles.length
    if (rejectedCount > 0) {
      setValidationErrors((prev) => ({ ...prev, images: "Some files were rejected (only images up to 10MB)." }))
    } else if (validationErrors.images) {
      setValidationErrors((prev) => ({ ...prev, images: undefined }))
    }

    const maxImages = 5
    const currentImageCount = formData.images.length
    const availableSlots = maxImages - currentImageCount
    const filesToAdd = validFiles.slice(0, availableSlots)

    if (filesToAdd.length > 0) {
      const newImages = [...formData.images, ...filesToAdd]
      setFormData((prev) => ({ ...prev, images: newImages }))

      // Create preview URLs
      const newPreviews = filesToAdd.map((file) => URL.createObjectURL(file))
      setImagePreviews((prev) => [...prev, ...newPreviews])
    }
  }

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    processImageFiles(files)

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeImage = (index: number) => {
    // Revoke the object URL to free memory
    if (imagePreviews[index]) {
      URL.revokeObjectURL(imagePreviews[index])
    }

    const newImages = formData.images.filter((_, i) => i !== index)
    const newPreviews = imagePreviews.filter((_, i) => i !== index)

    setFormData((prev) => ({ ...prev, images: newImages }))
    setImagePreviews(newPreviews)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      // Call the onSubmit callback if provided (for custom handling)
      if (onSubmit) {
        await onSubmit(formData)
      } else {
        // Default API submission logic
        const apiFormData = new FormData()
        apiFormData.append("product", formData.product)
        apiFormData.append("suggestion", formData.suggestion)

        // Append images
        formData.images.forEach((image, index) => {
          apiFormData.append(`image_${index}`, image)
        })

        // Submit to API
        const response = await fetch("/api/reports", {
          method: "POST",
          body: apiFormData,
        })

        const result = await response.json()

        if (response.ok && result.success) {
          toast.success(t("report-submitted-success"))
        } else {
          throw new Error(result.message || "Failed to submit report")
        }
      }

      // Clear form data after successful submission
      setFormData({ product: "", suggestion: "", images: [] })
      setImagePreviews([])
      setValidationErrors({})
      localStorage.removeItem(LOCAL_STORAGE_KEY)

      // Close dialog
      if (onOpenChange) {
        onOpenChange(false)
      }
    } catch (error) {
      console.error("Failed to submit report:", error)
      toast.error("Failed to submit report. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen)
    }

    // Clean up object URLs when dialog closes
    if (!newOpen) {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url))
      setValidationErrors({})
      setIsDragOver(false)
    }
  }

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {showTrigger && (
        <DialogTrigger asChild>
          {trigger || (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "w-full justify-start gap-2 bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 hover:text-orange-800 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-900 transition-colors",
                className,
              )}
            >
              <AlertTriangle className="h-4 w-4" />
              {t("report-problem")}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-7xl max-h-[90vh] overflow-hidden flex flex-col mx-auto">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900">
              <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            {t("report-problem")}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-2">
            {t("report-problem-description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-6" ref={formRef}>
            <div className="space-y-3">
              <Label htmlFor="product" className="text-sm font-medium flex items-center gap-1">
                {t("affected-product-required")}
              </Label>
              <Select value={formData.product} onValueChange={handleProductChange}>
                <SelectTrigger
                  className={cn("h-11", validationErrors.product && "border-red-500 focus:border-red-500")}
                >
                  <SelectValue placeholder={t("select-product-placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.value} value={product.value}>
                      {product.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.product && (
                <div className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.product}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label htmlFor="suggestion" className="text-sm font-medium flex items-center gap-1">
                {t("suggestion-improve")}
              </Label>
              <Textarea
                id="suggestion"
                placeholder={t("suggestion-placeholder")}
                value={formData.suggestion}
                onChange={handleSuggestionChange}
                className={cn(
                  "min-h-[120px] resize-y max-h-[250px]",
                  validationErrors.suggestion && "border-red-500 focus:border-red-500",
                )}
              />
              {validationErrors.suggestion && (
                <div className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.suggestion}
                </div>
              )}
              <div className="text-xs text-muted-foreground">{formData.suggestion.length}/1000 characters</div>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-medium">
                {t("screenshots-optional")} ({formData.images.length}/5)
              </Label>

              {formData.images.length < 5 && (
                <div
                  className={cn(
                    "relative border-2 border-dashed rounded-lg transition-all duration-200 mt-2",
                    isDragOver
                      ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20"
                      : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500",
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    id="image-upload"
                  />
                  <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full mb-3 transition-colors",
                        isDragOver ? "bg-orange-100 dark:bg-orange-900" : "bg-gray-100 dark:bg-gray-800",
                      )}
                    >
                      <Upload className={cn("h-5 w-5", isDragOver ? "text-orange-600" : "text-gray-400")} />
                    </div>
                    <p className="text-sm font-medium mb-1">
                      {isDragOver ? "Drop images here" : "Click to upload or drag and drop"}
                    </p>
                    <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB each</p>
                  </div>
                </div>
              )}

              {validationErrors.images && <div className="text-sm text-red-600">{validationErrors.images}</div>}

              {imagePreviews.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <div className="aspect-square rounded-lg border-2 border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800">
                        <img
                          src={preview || "/placeholder.svg"}
                          alt={t("screenshot-alt", { number: index + 1 })}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeImage(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3 w-full pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={!formData.product || !formData.suggestion.trim() || isSubmitting}
                className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {t("submitting")}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    {t("submit-report")}
                  </div>
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
