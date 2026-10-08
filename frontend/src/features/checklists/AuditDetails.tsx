import type { ReactNode } from 'react'

export function AuditDetails({ fields }: { fields: [string, ReactNode][] }) {
  return (
    <dl className="nf-details nf-audit-details">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
