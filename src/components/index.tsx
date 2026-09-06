import { useEffect, useRef, type ReactNode } from 'react';
import { CheckIcon, CloseIcon } from './Icons';
import { useT } from '../i18n/I18nProvider';
import './ui.css';

export function Card({ children, padded = false, className = '' }: {
  children: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <div className={`card ${padded ? 'card--padded' : ''} ${className}`.trim()}>{children}</div>
  );
}

export function Section({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section className="section">
      {label ? <h2 className="section__label">{label}</h2> : null}
      {children}
    </section>
  );
}

export function Row({
  title,
  subtitle,
  trailing,
  leading,
  onClick,
  muted = false,
  ariaLabel,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  leading?: ReactNode;
  onClick?: () => void;
  muted?: boolean;
  ariaLabel?: string;
}) {
  const className = `row ${onClick ? 'row--tappable' : ''} ${muted ? 'row--muted' : ''}`.trim();
  const content = (
    <>
      {leading}
      <span className="row__body">
        <span className="row__title">{title}</span>
        {subtitle ? <span className="row__subtitle">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="row__trailing">{trailing}</span> : null}
    </>
  );

  if (!onClick) return <div className={className}>{content}</div>;
  return (
    <button type="button" className={className} onClick={onClick} aria-label={ariaLabel}>
      {content}
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  block = false,
  disabled = false,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'destructive';
  block?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={`button button--${variant} ${block ? 'button--block' : ''}`.trim()}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** iOS-style switch. A real button with `aria-checked`, not a styled div. */
export function Switch({
  checked,
  onChange,
  label,
  accent,
}: {
  checked: boolean;
  onChange(next: boolean): void;
  label: string;
  accent?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      style={accent ? ({ '--switch-on': accent } as React.CSSProperties) : undefined}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__knob" />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange(next: T): void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented__option"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function BubbleRow({
  values,
  selected,
  onSelect,
  label,
  accent,
  describe,
}: {
  values: number[];
  selected: number | null;
  onSelect(value: number): void;
  label: string;
  accent?: string;
  describe?(value: number): string;
}) {
  return (
    <div
      className="bubble-row"
      role="group"
      aria-label={label}
      style={accent ? ({ '--bubble-accent': accent } as React.CSSProperties) : undefined}
    >
      {values.map((value) => (
        <button
          key={value}
          type="button"
          className="bubble"
          aria-pressed={value === selected}
          aria-label={describe ? describe(value) : String(value)}
          onClick={() => onSelect(value)}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon ? <span className="empty__icon">{icon}</span> : null}
      <span className="empty__title">{title}</span>
      {body ? <p className="empty__body">{body}</p> : null}
      {action}
    </div>
  );
}

/**
 * Bottom sheet. Focus moves into it on open and Escape closes it, so it
 * behaves like a modal for a keyboard and a screen reader too.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('input, button, textarea')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sheet-scrim" onClick={onClose} role="presentation">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet__grabber" aria-hidden="true" />
        <header className="sheet__header">
          <h2 className="sheet__title">{title}</h2>
          <button
            type="button"
            className="sheet__close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="sheet__body">{children}</div>
        {footer ? <div className="sheet__footer">{footer}</div> : null}
      </div>
    </div>
  );
}

/** A round check used by selectable cards. */
export function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <span className={`selection-mark ${selected ? 'selection-mark--on' : ''}`.trim()} aria-hidden="true">
      {selected ? <CheckIcon size={16} /> : null}
    </span>
  );
}
