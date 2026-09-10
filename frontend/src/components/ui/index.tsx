import { useId } from 'react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return (
    <button type={type} className={`nf-button nf-button--${variant} ${className}`} {...props} />
  )
}
export function Input({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId()
  return (
    <div className="nf-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} {...props} />
    </div>
  )
}
export function Select({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId()
  return (
    <div className="nf-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} {...props}>
        {children}
      </select>
    </div>
  )
}
export function Textarea({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId()
  return (
    <div className="nf-field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} {...props} />
    </div>
  )
}
export function Card({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <section className="nf-card">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  )
}
export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`nf-badge ${className}`}>{children}</span>
}
export function PageHeader({
  title,
  description,
  eyebrow = 'National Facilities',
}: {
  title: string
  description?: string
  eyebrow?: string
}) {
  return (
    <header className="nf-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  )
}
export function Alert({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return (
    <div
      className={`nf-alert ${success ? 'nf-alert--success' : ''}`}
      role={success ? 'status' : 'alert'}
    >
      {children}
    </div>
  )
}
export function EmptyState({
  children = 'No hay registros con estos filtros.',
}: {
  children?: ReactNode
}) {
  return (
    <div className="nf-empty" role="status">
      {children}
    </div>
  )
}
export function LoadingState() {
  return (
    <div className="nf-empty" role="status" aria-live="polite">
      Cargando información…
    </div>
  )
}
export function DataList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="nf-list" aria-label={label}>
      {children}
    </section>
  )
}
export function ResponsiveTable<T>({
  caption,
  rows,
  columns,
  rowKey,
}: {
  caption: string
  rows: T[]
  columns: { label: string; render: (row: T) => ReactNode }[]
  rowKey: (row: T) => string | number
}) {
  return (
    <>
      <div className="hidden lg:block">
        <table className="nf-table">
          <caption>{caption}</caption>
          <thead>
            <tr>
              {columns.map((col) => (
                <th scope="col" key={col.label}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => (
                  <td key={col.label}>{col.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="nf-list lg:hidden" aria-label={caption}>
        {rows.map((row) => (
          <article className="nf-card" key={rowKey(row)}>
            <dl className="nf-details">
              {columns.map((col) => (
                <div key={col.label}>
                  <dt>{col.label}</dt>
                  <dd>{col.render(row)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      {rows.length === 0 && <EmptyState />}
    </>
  )
}
