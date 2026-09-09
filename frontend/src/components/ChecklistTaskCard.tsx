import { AlertTriangle, Camera, CheckCircle2, RotateCcw, Trash2 } from 'lucide-react'
import type { ChecklistAnswer } from '../types/domain'
import type { ChecklistTask } from '../features/technician/data'

type Props = {
  task: ChecklistTask
  order: number
  answer?: ChecklistAnswer
  onConforming: () => void
  onNonConforming: () => void
  onCamera: () => void
  onRemove: () => void
}

export function ChecklistTaskCard({ task, order, answer, onConforming, onNonConforming, onCamera, onRemove }: Props) {
  const status = answer?.result === 'conforme' ? 'complete' : answer?.result === 'no_conforme' ? 'non-compliant' : 'pending'
  const statusLabel = status === 'complete' ? 'Conforme' : status === 'non-compliant' ? 'No conforme' : 'Pendiente'

  return <article className={`task-card task-card--${status}`}>
    <header className="task-card__heading">
      <span className="task-card__number" aria-label={`Tarea ${order}`}>{order}</span>
      <div className="task-card__title">
        <div className="task-card__title-line"><h2>{task.title}</h2><span className={`task-status task-status--${status}`}>{statusLabel}</span></div>
        <span className={task.photoRequired ? 'required-label' : 'optional-label'}>{task.photoRequired ? 'Foto obligatoria' : 'Foto opcional'}</span>
      </div>
    </header>

    <div className="choice-group" role="group" aria-label={`Resultado de ${task.title}`}>
      <button type="button" className={`choice-button choice-button--good ${answer?.result === 'conforme' ? 'choice-button--selected-good' : ''}`} aria-label="✓ Conforme" aria-pressed={answer?.result === 'conforme'} onClick={onConforming}>
        <CheckCircle2 size={18} aria-hidden="true" /> <span>Conforme</span>
      </button>
      <button type="button" className={`choice-button choice-button--bad ${answer?.result === 'no_conforme' ? 'choice-button--selected-bad' : ''}`} aria-label="! No conforme" aria-pressed={answer?.result === 'no_conforme'} onClick={onNonConforming}>
        <AlertTriangle size={18} aria-hidden="true" /> <span>No conforme</span>
      </button>
    </div>

    {answer?.observation && <p className="task-card__observation"><AlertTriangle size={16} aria-hidden="true" /><span><strong>Observación:</strong> {answer.observation}</span></p>}

    <div className={`photo-control ${answer?.evidence ? 'photo-control--captured' : ''}`}>
      {answer?.evidence ? <>
        <img className="photo-preview" src={answer.evidence.objectUrl} alt={`Evidencia de ${task.title}`} />
        <div className="photo-control__meta"><strong>Evidencia capturada</strong><span>{task.photoRequired ? 'Foto obligatoria registrada' : 'Foto opcional registrada'}</span></div>
        <button className="action-button action-button--ghost photo-control__action" type="button" onClick={onCamera}><RotateCcw size={16} aria-hidden="true" /> Repetir</button>
        <button className="icon-button icon-button--danger" type="button" aria-label="Eliminar fotografía" onClick={onRemove}><Trash2 size={17} aria-hidden="true" /></button>
      </> : <>
        <div className="photo-control__intro"><Camera size={20} aria-hidden="true" /><div><strong>Captura de evidencia</strong><span>{task.photoRequired ? 'Necesaria para completar esta tarea' : 'Opcional para esta tarea'}</span></div></div>
        <button className="action-button action-button--outline photo-control__action" type="button" aria-label="Tomar foto" onClick={onCamera}><Camera size={17} aria-hidden="true" /> Tomar fotografía</button>
      </>}
    </div>
  </article>
}
