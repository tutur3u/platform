import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { memo } from 'react';

interface PostFormFieldProps {
  id: string;
  label: string;
  limitMessage: string;
  maxLength: number;
  name: string;
  placeholder: string;
  value: string;
}

interface PostInputFieldProps extends PostFormFieldProps {
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

interface PostTextareaFieldProps extends PostFormFieldProps {
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

function FieldMeta({
  count,
  limitMessage,
  maxLength,
}: {
  count: number;
  limitMessage: string;
  maxLength: number;
}) {
  const isOverLimit = count > maxLength;

  return (
    <div className="flex min-h-5 items-start justify-between gap-3 text-xs">
      <p className="text-destructive" role={isOverLimit ? 'alert' : undefined}>
        {isOverLimit ? limitMessage : null}
      </p>
      <p className={isOverLimit ? 'text-destructive' : 'text-muted-foreground'}>
        {count.toLocaleString()} / {maxLength.toLocaleString()}
      </p>
    </div>
  );
}

export const PostInputField = memo(function PostInputField({
  id,
  label,
  limitMessage,
  maxLength,
  name,
  onChange,
  placeholder,
  value,
}: PostInputFieldProps) {
  const descriptionId = `${id}-limit`;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        aria-describedby={descriptionId}
        aria-invalid={value.length > maxLength}
        id={id}
        maxLength={maxLength}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        value={value}
      />
      <div id={descriptionId}>
        <FieldMeta
          count={value.length}
          limitMessage={limitMessage}
          maxLength={maxLength}
        />
      </div>
    </div>
  );
});

export const PostTextareaField = memo(function PostTextareaField({
  id,
  label,
  limitMessage,
  maxLength,
  name,
  onChange,
  placeholder,
  value,
}: PostTextareaFieldProps) {
  const descriptionId = `${id}-limit`;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        aria-describedby={descriptionId}
        aria-invalid={value.length > maxLength}
        className="min-h-40 resize-y"
        id={id}
        maxLength={maxLength}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        value={value}
      />
      <div id={descriptionId}>
        <FieldMeta
          count={value.length}
          limitMessage={limitMessage}
          maxLength={maxLength}
        />
      </div>
    </div>
  );
});
