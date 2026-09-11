import { useEffect, useMemo, useState } from 'react'
import type { Visit } from '../../types/models'
import { displayDate } from '../../utils/dates'

export function ChecklistTimer({ visit }: { visit: Visit }) {
  const expiresAt = visit.expiresAt ? Date.parse(visit.expiresAt) : NaN
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!Number.isFinite(expiresAt)) return
    const initial = window.setTimeout(() => setNow(Date.now()), 0)
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [expiresAt])
  const remaining = useMemo(() => Math.max(0, expiresAt - now), [expiresAt, now])
  if (!Number.isFinite(expiresAt) || !visit.startedAt) return null
  const seconds = Math.ceil(remaining / 1000)
  const text = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const expired = remaining === 0
  return (
    <section className="nf-card" aria-label="Tiempo del checklist">
      <h2>{expired ? 'Tiempo agotado' : 'Tiempo restante'}</h2>
      <p>Inicio: {displayDate(visit.startedAt)}</p>
      <p>Hora límite: {displayDate(visit.expiresAt)}</p>
      <strong className="nf-metric">{text}</strong>
      {expired ? (
        <p role="alert">El tiempo máximo para completar el checklist ha vencido.</p>
      ) : seconds <= 60 ? (
        <p role="status" aria-live="polite">
          Queda menos de un minuto para finalizar.
        </p>
      ) : null}
    </section>
  )
}
