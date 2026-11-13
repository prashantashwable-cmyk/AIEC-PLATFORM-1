'use client';

import {
  createContext, startTransition, useActionState, useContext, useEffect, useId, useRef,
  type ComponentProps, type FormEvent, type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useT } from '@/i18n/client';
import type { TParams } from '@/i18n';
import { cn } from '@/lib/format';
import { Alert, buttonClass, type ButtonSize, type ButtonVariant } from './index';

export type ActionResult =
  | { ok: true; message?: string; params?: TParams; redirect?: string }
  | { ok: false; error: string; params?: TParams; fieldErrors?: Record<string, string> }
  | null;
export type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

const FormContext = createContext<{ pending: boolean; fieldErrors: Record<string, string> }>({ pending: false, fieldErrors: {} });

/**
 * Form wired to a server action. Submission is dispatched manually so that the
 * user's input is preserved when the server reports a validation error.
 */
export function ActionForm({
  action, children, className, resetOnSuccess = true, hideSuccess = false, onSuccess,
}: {
  action: FormAction; children: ReactNode; className?: string; resetOnSuccess?: boolean; hideSuccess?: boolean;
  onSuccess?: (result: Extract<ActionResult, { ok: true }>) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => { onSuccessRef.current = onSuccess; });

  useEffect(() => {
    if (!state?.ok) return;
    if (resetOnSuccess) ref.current?.reset();
    onSuccessRef.current?.(state);
    if (state.redirect) router.push(state.redirect);
    else router.refresh();
  }, [state, resetOnSuccess, router]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const confirmText = submitter?.getAttribute('data-confirm');
    if (confirmText && !window.confirm(confirmText)) return;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(data));
  }

  return (
    <FormContext.Provider value={{ pending, fieldErrors: state && !state.ok ? (state.fieldErrors ?? {}) : {} }}>
      <form ref={ref} action={formAction} onSubmit={onSubmit} className={className} noValidate>
        {state && !state.ok && <Alert tone="red" className="mb-3">{t(`err.${state.error}`, state.params)}</Alert>}
        {state?.ok && !hideSuccess && !state.redirect && (
          <Alert tone="green" className="mb-3">{t(state.message ?? 'common.saved', state.params)}</Alert>
        )}
        {children}
      </form>
    </FormContext.Provider>
  );
}

export function SubmitButton({
  children, variant = 'primary', size = 'md', className, confirm, ...props
}: Omit<ComponentProps<'button'>, 'type'> & { variant?: ButtonVariant; size?: ButtonSize; confirm?: string }) {
  const { pending } = useContext(FormContext);
  return (
    <button type="submit" disabled={pending || props.disabled} data-confirm={confirm} className={buttonClass(variant, size, className)} {...props}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const CONTROL =
  'block w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:bg-slate-100';

function FieldShell({
  id, label, hint, name, required, children, className,
}: { id: string; label?: ReactNode; hint?: ReactNode; name?: string; required?: boolean; children: ReactNode; className?: string }) {
  const t = useT();
  const { fieldErrors } = useContext(FormContext);
  const error = name ? fieldErrors[name] : undefined;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
          {label}
          {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-700" role="alert">{t(`err.${error}`)}</p>}
    </div>
  );
}

type Common = { label?: ReactNode; hint?: ReactNode; wrapperClassName?: string };

export function Field({ label, hint, wrapperClassName, className, ...props }: ComponentProps<'input'> & Common) {
  const id = useId();
  const { fieldErrors } = useContext(FormContext);
  const invalid = props.name ? Boolean(fieldErrors[props.name]) : false;
  return (
    <FieldShell id={id} label={label} hint={hint} name={props.name} required={props.required} className={wrapperClassName}>
      <input id={id} aria-invalid={invalid || undefined} className={cn(CONTROL, invalid && 'border-red-500', className)} {...props} />
    </FieldShell>
  );
}

export function SelectField({
  label, hint, wrapperClassName, className, options, placeholder, ...props
}: ComponentProps<'select'> & Common & { options: Array<{ value: string; label: string }>; placeholder?: string }) {
  const id = useId();
  const { fieldErrors } = useContext(FormContext);
  const invalid = props.name ? Boolean(fieldErrors[props.name]) : false;
  return (
    <FieldShell id={id} label={label} hint={hint} name={props.name} required={props.required} className={wrapperClassName}>
      <select id={id} aria-invalid={invalid || undefined} className={cn(CONTROL, invalid && 'border-red-500', className)} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FieldShell>
  );
}

export function TextareaField({ label, hint, wrapperClassName, className, ...props }: ComponentProps<'textarea'> & Common) {
  const id = useId();
  const { fieldErrors } = useContext(FormContext);
  const invalid = props.name ? Boolean(fieldErrors[props.name]) : false;
  return (
    <FieldShell id={id} label={label} hint={hint} name={props.name} required={props.required} className={wrapperClassName}>
      <textarea id={id} rows={3} aria-invalid={invalid || undefined} className={cn(CONTROL, invalid && 'border-red-500', className)} {...props} />
    </FieldShell>
  );
}

export function CheckboxField({ label, hint, wrapperClassName, ...props }: Omit<ComponentProps<'input'>, 'type'> & Common) {
  const id = useId();
  const t = useT();
  const { fieldErrors } = useContext(FormContext);
  const error = props.name ? fieldErrors[props.name] : undefined;
  return (
    <div className={wrapperClassName}>
      <div className="flex items-start gap-2.5">
        <input id={id} type="checkbox" className="mt-1 size-4 shrink-0 rounded border-slate-400 text-brand-600 accent-brand-600" {...props} />
        <label htmlFor={id} className="text-sm text-slate-800">
          {label}
          {props.required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
        </label>
      </div>
      {hint && !error && <p className="mt-1 ml-6.5 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 ml-6.5 text-xs font-medium text-red-700" role="alert">{t(`err.${error}`)}</p>}
    </div>
  );
}
