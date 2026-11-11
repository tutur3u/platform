'use client';

import { useActions, useBoundProp, useStateStore } from '@json-render/react';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2 } from '@tuturuuu/icons';
import type {
  JsonRenderCheckboxGroupProps,
  JsonRenderCheckboxProps,
  JsonRenderComponentContext,
  JsonRenderFileAttachmentInputProps,
  JsonRenderFormProps,
  JsonRenderInputProps,
  JsonRenderRadioGroupProps,
  JsonRenderSelectProps,
  JsonRenderTextareaProps,
  JsonRenderTransactionCategory,
} from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { MissedEntryImageUploadSection } from '@tuturuuu/ui/custom/missed-entry/image-upload-section';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useParams } from 'next/navigation';
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  deriveFormFieldName,
  normalizeTextControlValue,
} from '../../form-field-utils';
import {
  shouldUseTimeTrackingRequestAction,
  useComponentValue,
  useCreateTimeTrackingRequest,
} from '../shared';

type FormActionHandler =
  | ((params: Record<string, unknown>) => unknown)
  | ((params: Record<string, unknown>) => Promise<unknown>);

type JsonRenderStringBinding = { value?: string };
type JsonRenderCheckboxBinding = { checked?: string };
type JsonRenderStringArrayBinding = { values?: string };
type JsonRenderSubmitBinding = { onSubmit?: string };

type JsonRenderFormComponentProps = Omit<JsonRenderFormProps, 'onSubmit'> & {
  onSubmit?: unknown;
};

type JsonRenderFileAttachmentInputComponentProps = Omit<
  JsonRenderFileAttachmentInputProps,
  'value'
> & {
  value?: unknown;
};

type JsonRenderCheckboxComponentProps = Omit<
  JsonRenderCheckboxProps,
  'checked'
> & {
  checked?: unknown;
};

type JsonRenderCheckboxGroupComponentProps = Omit<
  JsonRenderCheckboxGroupProps,
  'values'
> & {
  values?: unknown;
};

type JsonRenderRadioGroupComponentProps = Omit<
  JsonRenderRadioGroupProps,
  'value'
> & {
  value?: unknown;
};

type JsonRenderSelectComponentProps = Omit<JsonRenderSelectProps, 'value'> & {
  value?: unknown;
};

const EMPTY_FILES: File[] = [];

type FormSubmitParams = {
  props: JsonRenderFormComponentProps;
  state: Record<string, unknown>;
  submitParams: Record<string, unknown>;
  wsId: string;
  handlers: Record<string, FormActionHandler>;
  createTimeTrackingRequest: (
    params: Record<string, unknown>
  ) => Promise<{ success: true }>;
  setOnSubmit?: ((value: unknown) => unknown | Promise<unknown>) | null;
};

type FormSubmitResult = {
  actionName: string;
  message: string;
};

type ActionErrorResult = {
  success?: boolean;
  error: string;
};

const isActionError = (value: unknown): value is ActionErrorResult => {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.error !== 'string') return false;

  return (
    candidate.success === undefined || typeof candidate.success === 'boolean'
  );
};

const handleFormSubmit = async ({
  props,
  state,
  submitParams,
  wsId,
  handlers,
  createTimeTrackingRequest,
  setOnSubmit,
}: FormSubmitParams): Promise<FormSubmitResult> => {
  const values = state || {};
  const actionName = shouldUseTimeTrackingRequestAction(
    props.submitAction,
    values,
    submitParams
  )
    ? 'create_time_tracking_request'
    : props.submitAction || 'submit_form';

  let actionResult: unknown = null;

  if (actionName === 'create_time_tracking_request') {
    actionResult = await createTimeTrackingRequest({
      ...submitParams,
      ...values,
      wsId,
    });
  } else {
    const handler = handlers[actionName];
    if (handler) {
      if (actionName === 'submit_form') {
        actionResult = await handler({
          title: props.title,
          values,
        });
      } else {
        actionResult = await handler({
          ...submitParams,
          ...values,
          wsId,
        });
      }
    } else if (setOnSubmit) {
      await setOnSubmit({
        title: props.title,
        values,
      });
    } else {
      throw new Error(`Action "${actionName}" not found`);
    }
  }

  if (
    isActionError(actionResult) &&
    (actionResult.success === undefined || actionResult.success === false)
  ) {
    throw new Error(actionResult.error);
  }

  return {
    actionName,
    message:
      actionName === 'submit_form'
        ? 'Sent to assistant successfully.'
        : 'Submitted successfully!',
  };
};

export const dashboardFormComponents = {
  Form: ({
    props,
    children,
    bindings,
  }: JsonRenderComponentContext<
    JsonRenderFormComponentProps,
    JsonRenderSubmitBinding
  >) => {
    const params = useParams();
    const wsId = params.wsId as string;
    const { state } = useStateStore();
    const { handlers } = useActions();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const createTimeTrackingRequestMutation = useCreateTimeTrackingRequest();
    const submitBindingPath =
      bindings?.onSubmit ||
      (typeof props.onSubmit === 'string' ? props.onSubmit : undefined);

    const [, setOnSubmit] = useBoundProp<unknown>(null, submitBindingPath);

    return (
      <div className="my-4 flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
        <div>
          <h3 className="font-semibold text-lg">{props.title}</h3>
          {props.description && (
            <p className="text-muted-foreground text-sm">{props.description}</p>
          )}
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setIsSubmitting(true);
            setIsSuccess(false);
            setError(null);
            setMessage(null);
            try {
              const submitParams =
                (props as { submitParams?: Record<string, unknown> })
                  .submitParams || {};
              const result = await handleFormSubmit({
                props,
                state: ((state as Record<string, unknown>) || {}) as Record<
                  string,
                  unknown
                >,
                submitParams,
                wsId,
                handlers: handlers as Record<string, FormActionHandler>,
                createTimeTrackingRequest:
                  createTimeTrackingRequestMutation.mutateAsync,
                setOnSubmit,
              });
              setIsSuccess(true);
              setMessage(result.message);
            } catch (err) {
              setIsSuccess(false);
              setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <div className="flex flex-col gap-4">{children}</div>
          <Button
            type="submit"
            disabled={
              isSubmitting ||
              isSuccess ||
              createTimeTrackingRequestMutation.isPending
            }
            className="mt-2 w-full"
          >
            {isSubmitting || createTimeTrackingRequestMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : isSuccess ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Submitted
              </>
            ) : (
              props.submitLabel || 'Submit'
            )}
          </Button>
          {error && <p className="text-dynamic-red text-sm">{error}</p>}
          {message && !error && (
            <p className="text-dynamic-green text-sm">{message}</p>
          )}
        </form>
      </div>
    );
  },
  Input: ({
    props,
    bindings,
  }: JsonRenderComponentContext<
    JsonRenderInputProps,
    JsonRenderStringBinding
  >) => {
    const fieldName = deriveFormFieldName(props.name, props.label, 'input');
    const [rawValue, setValue] = useComponentValue<unknown>(
      props.value,
      bindings?.value,
      fieldName,
      ''
    );
    const value = normalizeTextControlValue(rawValue);
    return (
      <div className="relative flex flex-col gap-2">
        <Label htmlFor={fieldName}>{props.label}</Label>
        <Input
          id={fieldName}
          type={props.type || 'text'}
          placeholder={props.placeholder}
          required={props.required}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
    );
  },
  FileAttachmentInput: ({
    props,
    bindings,
  }: JsonRenderComponentContext<
    JsonRenderFileAttachmentInputComponentProps,
    JsonRenderStringBinding
  >) => {
    const maxFiles = props.maxFiles || 5;
    const initialFiles = Array.isArray(props.value)
      ? props.value.filter((file): file is File => file instanceof File)
      : EMPTY_FILES;
    const [files, setFiles] = useComponentValue<File[]>(
      initialFiles,
      bindings?.value,
      props.name,
      []
    );
    const [isDragOver, setIsDragOver] = useState(false);
    const [imageError, setImageError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const safeFiles = Array.isArray(files) ? files : EMPTY_FILES;

    const imagePreviews = useMemo(
      () => safeFiles.map((file) => URL.createObjectURL(file)),
      [safeFiles]
    );

    useEffect(() => {
      return () => {
        imagePreviews.forEach((url) => {
          URL.revokeObjectURL(url);
        });
      };
    }, [imagePreviews]);

    const addFiles = useCallback(
      (incoming: File[]) => {
        const imageFiles = incoming.filter((file) =>
          file.type.startsWith('image/')
        );

        if (imageFiles.length !== incoming.length) {
          setImageError('Only image files are supported');
        } else {
          setImageError(null);
        }

        const availableSlots = Math.max(0, maxFiles - safeFiles.length);
        const filesToAdd = imageFiles.slice(0, availableSlots);

        if (filesToAdd.length < imageFiles.length) {
          setImageError(`You can upload up to ${maxFiles} images`);
        }

        if (filesToAdd.length > 0) {
          setFiles([...safeFiles, ...filesToAdd]);
        }
      },
      [maxFiles, safeFiles, setFiles]
    );

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(event.target.files || []);
      addFiles(selected);
      event.target.value = '';
    };

    const handleDragOver = (event: DragEvent<Element>) => {
      event.preventDefault();
      setIsDragOver(true);
    };

    const handleDragLeave = (event: DragEvent<Element>) => {
      event.preventDefault();
      setIsDragOver(false);
    };

    const handleDrop = (event: DragEvent<Element>) => {
      event.preventDefault();
      setIsDragOver(false);
      const dropped = Array.from(event.dataTransfer.files || []);
      addFiles(dropped);
    };

    const handleRemoveNew = (index: number) => {
      const nextFiles = safeFiles.filter((_, fileIndex) => fileIndex !== index);
      setFiles(nextFiles);
      setImageError(null);
    };

    return (
      <div className="relative flex flex-col gap-2">
        {props.description && (
          <p className="text-muted-foreground text-xs">{props.description}</p>
        )}
        <MissedEntryImageUploadSection
          imagePreviews={imagePreviews}
          isDragOver={isDragOver}
          imageError={imageError}
          canAddMore={safeFiles.length < maxFiles}
          fileInputRef={fileInputRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onFileChange={handleFileChange}
          onRemoveNew={handleRemoveNew}
          onRemoveExisting={() => {}}
          labels={{
            proofOfWork: `${props.label} (${safeFiles.length}/${maxFiles})`,
            compressing: 'Processing images...',
            dropImages: 'Drop images here',
            clickToUpload: 'Click to upload or drag and drop',
            imageFormats: 'PNG, JPG, GIF, or WebP up to 1MB each',
            proofImageAlt: 'Proof image',
            existing: 'Existing',
            new: 'New',
          }}
        />
        {props.required && safeFiles.length === 0 && (
          <input
            tabIndex={-1}
            aria-hidden
            required
            value=""
            onChange={() => {}}
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />
        )}
      </div>
    );
  },
  Textarea: ({
    props,
    bindings,
  }: JsonRenderComponentContext<
    JsonRenderTextareaProps,
    JsonRenderStringBinding
  >) => {
    const fieldName = deriveFormFieldName(props.name, props.label, 'textarea');
    const [rawValue, setValue] = useComponentValue<unknown>(
      props.value,
      bindings?.value,
      fieldName,
      ''
    );
    const value = normalizeTextControlValue(rawValue);
    return (
      <div className="relative flex flex-col gap-2">
        <Label htmlFor={fieldName}>{props.label}</Label>
        <Textarea
          id={fieldName}
          placeholder={props.placeholder}
          required={props.required}
          rows={props.rows || (props.multiline ? 4 : 3)}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
    );
  },
  Checkbox: ({
    props,
    bindings,
  }: JsonRenderComponentContext<
    JsonRenderCheckboxComponentProps,
    JsonRenderCheckboxBinding
  >) => {
    const initialChecked =
      typeof props.checked === 'boolean' ? props.checked : false;
    const [checked, setChecked] = useComponentValue<boolean>(
      initialChecked,
      bindings?.checked,
      props.name,
      false
    );
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center space-x-2">
          <Checkbox
            id={props.name}
            checked={!!checked}
            onCheckedChange={(val) => setChecked(!!val)}
            required={props.required}
          />
          <Label
            htmlFor={props.name}
            className="font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {props.label}
          </Label>
        </div>
        {props.description && (
          <p className="pl-6 text-muted-foreground text-xs">
            {props.description}
          </p>
        )}
      </div>
    );
  },
  CheckboxGroup: ({
    props,
    bindings,
  }: JsonRenderComponentContext<
    JsonRenderCheckboxGroupComponentProps,
    JsonRenderStringArrayBinding
  >) => {
    const initialValues = Array.isArray(props.values)
      ? props.values.filter(
          (value): value is string => typeof value === 'string'
        )
      : [];
    const [values, setValues] = useComponentValue<string[]>(
      initialValues,
      bindings?.values,
      props.name,
      []
    );

    const toggleValue = (value: string) => {
      const current = Array.isArray(values) ? values : [];
      if (current.includes(value)) {
        setValues(current.filter((v) => v !== value));
      } else {
        setValues([...current, value]);
      }
    };

    return (
      <div className="flex flex-col gap-3">
        <Label>{props.label}</Label>
        <div className="flex flex-col gap-2">
          {props.options?.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <Checkbox
                id={`${props.name}-${option.value}`}
                checked={(values || []).includes(option.value)}
                onCheckedChange={() => toggleValue(option.value)}
              />
              <Label
                htmlFor={`${props.name}-${option.value}`}
                className="font-normal text-sm leading-none"
              >
                {option.label}
              </Label>
            </div>
          ))}
        </div>
      </div>
    );
  },
  RadioGroup: ({
    props,
    bindings,
  }: JsonRenderComponentContext<
    JsonRenderRadioGroupComponentProps,
    JsonRenderStringBinding
  >) => {
    const initialValue = typeof props.value === 'string' ? props.value : '';
    const [value, setValue] = useComponentValue<string>(
      initialValue,
      bindings?.value,
      props.name,
      ''
    );
    return (
      <div className="flex flex-col gap-3">
        <Label>{props.label}</Label>
        <RadioGroup
          value={value}
          onValueChange={setValue}
          className="flex flex-col gap-2"
          required={props.required}
        >
          {props.options?.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <RadioGroupItem
                value={option.value}
                id={`${props.name}-${option.value}`}
              />
              <Label
                htmlFor={`${props.name}-${option.value}`}
                className="font-normal text-sm leading-none"
              >
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    );
  },
  Select: ({
    props,
    bindings,
  }: JsonRenderComponentContext<
    JsonRenderSelectComponentProps,
    JsonRenderStringBinding
  >) => {
    if (props.name === 'categoryId') {
      return <CategorySelectField props={props} bindings={bindings} />;
    }

    return <StandardSelectField props={props} bindings={bindings} />;
  },
};

function StandardSelectField({
  props,
  bindings,
}: JsonRenderComponentContext<
  JsonRenderSelectComponentProps,
  JsonRenderStringBinding
>) {
  const initialValue = typeof props.value === 'string' ? props.value : '';
  const [value, setValue] = useComponentValue<string>(
    initialValue,
    bindings?.value,
    props.name,
    ''
  );

  const handleValueChange = (newVal: string) => {
    setValue(newVal);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={props.name}>{props.label}</Label>
      <Select
        value={value}
        onValueChange={handleValueChange}
        required={props.required}
      >
        <SelectTrigger id={props.name} className="w-full">
          <SelectValue placeholder={props.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {props.options?.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CategorySelectField({
  props,
  bindings,
}: JsonRenderComponentContext<
  JsonRenderSelectComponentProps,
  JsonRenderStringBinding
>) {
  const params = useParams();
  const wsId = params.wsId as string;
  const { set } = useStateStore();

  const initialValue = typeof props.value === 'string' ? props.value : '';
  const [value, setValue] = useComponentValue<string>(
    initialValue,
    bindings?.value,
    props.name,
    ''
  );

  const { data: categories } = useQuery({
    queryKey: ['workspaces', wsId, 'finance', 'transactions', 'categories'],
    queryFn: async (): Promise<JsonRenderTransactionCategory[]> => {
      const res = await fetch(
        `/api/workspaces/${wsId}/transactions/categories`,
        {
          cache: 'no-store',
        }
      );
      if (!res.ok) return [];
      return (await res.json()) as JsonRenderTransactionCategory[];
    },
    enabled: !!wsId,
  });

  const handleValueChange = (newVal: string) => {
    setValue(newVal);

    if (props.name === 'categoryId' && categories) {
      const category = categories.find((c) => c.id === newVal);
      if (category) {
        const type = category.is_expense ? 'expense' : 'income';
        set('/type', type);
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={props.name}>{props.label}</Label>
      <Select
        value={value}
        onValueChange={handleValueChange}
        required={props.required}
      >
        <SelectTrigger id={props.name} className="w-full">
          <SelectValue placeholder={props.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {props.options?.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
