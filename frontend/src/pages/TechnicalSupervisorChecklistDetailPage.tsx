import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { approveSupervisorChecklist, supervisorChecklists } from '../features/technicalSupervisor/checklists'

export default function TechnicalSupervisorChecklistDetailPage() {
  const { id } = useParams()
  const checklist = supervisorChecklists.find((item) => item.id === id)
  const [, refresh] = useState(0)
  if (!checklist) return <div className="ts-empty">Checklist no encontrado.<br /><Link to="/technical-supervisor/checklists">Volver a checklists</Link></div>
  const approve = () => { approveSupervisorChecklist(checklist.id); refresh((value) => value + 1) }
  return <section>
    <Link className="ts-back" to="/technical-supervisor/checklists">← Checklists</Link>
    <div className="ts-heading"><span className="eyebrow">{checklist.id}</span><div className="ts-heading__row"><h1>Detalle del checklist</h1><span className={`ts-badge ${checklist.status === 'Completado' ? 'done' : checklist.status === 'Por aprobar' ? 'review' : 'pending'}`}>{checklist.status}</span></div><p>{checklist.store} · {checklist.address}</p></div>
    <div className="ts-checklist-detail-grid"><article className="ts-panel"><h2>Información de la visita</h2><dl className="ts-detail-list"><dt>Técnico</dt><dd>{checklist.technician}</dd><dt>Fecha del reporte</dt><dd>{checklist.reportedAt}</dd><dt>Fecha de finalización</dt><dd>{checklist.completedAt ?? 'Pendiente'}</dd><dt>Ubicación</dt><dd>{checklist.gpsValidated ? 'Validada automáticamente' : 'Requiere validación'}</dd></dl>{checklist.gpsJustification && <div className="ts-checklist-note"><strong>Justificación GPS</strong><p>{checklist.gpsJustification}</p></div>}</article><article className="ts-panel"><h2>Resumen</h2><p className="ts-checklist-count">{checklist.evidence.length} evidencias adjuntas</p>{checklist.status === 'Por aprobar' && <button className="ts-button" onClick={approve}>Aprobar y completar</button>}{checklist.status === 'Completado' && <p className="ts-success">Checklist validado y completado.</p>}</article></div>
    <article className="ts-panel ts-evidence-panel"><h2>Evidencias del técnico</h2>{checklist.evidence.length === 0 ? <p className="ts-muted">No hay evidencias registradas todavía.</p> : <div className="ts-evidence-grid">{checklist.evidence.map((evidence) => <div className="ts-evidence-card" key={evidence.task}><img src={evidence.photo} alt={`Evidencia de ${evidence.task}`} /><div><strong>{evidence.task}</strong><span className={`ts-badge ${evidence.result === 'Conforme' ? 'done' : 'review'}`}>{evidence.result}</span>{evidence.observation && <p>{evidence.observation}</p>}</div></div>)}</div>}</article>
  </section>
}
