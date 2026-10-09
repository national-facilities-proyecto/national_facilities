import { useId, useState, type ReactNode } from 'react'
import { Button } from './ui'

export function ListFilters({
  children,
  search,
  active,
  onClear,
}: {
  children: ReactNode
  search?: ReactNode
  active: string[]
  onClear: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  return (
    <section className="nf-list-filters" aria-label="Filtros del listado">
      <div className="nf-filter-bar">
        {search}
        <Button
          variant="secondary"
          className="nf-filter-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          Filtros{active.length ? ` (${active.length})` : ''}
        </Button>
        {active.length > 0 && (
          <Button variant="secondary" onClick={onClear}>
            Limpiar filtros
          </Button>
        )}
      </div>
      {active.length > 0 && (
        <p className="nf-filter-summary" role="status">
          Filtros activos: {active.join(' · ')}
        </p>
      )}
      <div
        id={id}
        className={`nf-filter-controls ${expanded ? '' : 'nf-filter-controls--collapsed'}`}
      >
        {children}
      </div>
      <small>Calendario del navegador; fechas mostradas como día/mes/año (Perú).</small>
    </section>
  )
}
