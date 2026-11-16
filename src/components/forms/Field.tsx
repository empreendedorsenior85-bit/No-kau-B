import type { ComponentProps, ReactNode } from "react";

const control =
  "mt-2 block w-full rounded-xl border bg-kau-900 px-4 py-3.5 text-base text-white placeholder:text-mist/60 " +
  "transition-[border-color,box-shadow] duration-300 focus:border-gold-300 focus:outline-none focus:ring-2 focus:ring-gold-300/30 " +
  "[color-scheme:dark]";

type Base = { label: string; name: string; error?: string; hint?: ReactNode; optional?: boolean };

function Wrap({ label, name, error, hint, optional, children }: Base & { children: ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="text-sm text-white">
        {label} {optional && <span className="text-mist">(opcional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} role="alert" className="mt-1.5 text-sm text-[#e48a7d]">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-mist">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ label, name, error, hint, optional, ...rest }: Base & ComponentProps<"input">) {
  return (
    <Wrap label={label} name={name} error={error} hint={hint} optional={optional}>
      <input
        id={name}
        name={name}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`${control} ${error ? "border-danger" : "border-kau-800"}`}
        {...rest}
      />
    </Wrap>
  );
}

export function Textarea({ label, name, error, hint, optional, ...rest }: Base & ComponentProps<"textarea">) {
  return (
    <Wrap label={label} name={name} error={error} hint={hint} optional={optional}>
      <textarea
        id={name}
        name={name}
        rows={4}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`${control} resize-y ${error ? "border-danger" : "border-kau-800"}`}
        {...rest}
      />
    </Wrap>
  );
}

export function Select({ label, name, error, hint, optional, children, ...rest }: Base & ComponentProps<"select">) {
  return (
    <Wrap label={label} name={name} error={error} hint={hint} optional={optional}>
      <select
        id={name}
        name={name}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`${control} appearance-none ${error ? "border-danger" : "border-kau-800"}`}
        {...rest}
      >
        {children}
      </select>
    </Wrap>
  );
}

/** Campo-armadilha anti-spam, invisível para pessoas e leitores de ecrã. */
export function Honeypot() {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}
