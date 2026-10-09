import { useState, type ReactNode } from 'react'

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <details className="nf-disclosure" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>{title}</summary>
      {expanded && <div className="nf-disclosure__content">{children}</div>}
    </details>
  )
}
