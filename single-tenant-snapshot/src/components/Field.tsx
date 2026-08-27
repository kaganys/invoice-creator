import type { ReactNode } from 'react'

type FieldProps = {
  label: string
  htmlFor: string
  className?: string
  error?: string
  children: ReactNode
}

export function fieldErrorId(htmlFor: string): string {
  return `${htmlFor}-error`
}

export function Field({
  label,
  htmlFor,
  className,
  error,
  children,
}: FieldProps) {
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="field__error" id={fieldErrorId(htmlFor)} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
