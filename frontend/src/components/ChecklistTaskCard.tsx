import type { Answer, ChecklistTask } from '../types/models'
import { Badge, Button } from './ui'
import { EvidenceGallery } from './EvidenceGallery'
export function ChecklistTaskCard({
  task,
  order,
  answer,
  onConforming,
  onNonConforming,
  onCamera,
  onRemove,
}: {
  task: ChecklistTask
  order: number
  answer?: Answer
  onConforming(this: void): void
  onNonConforming(this: void): void
  onCamera(this: void): void
  onRemove(this: void, id: string): void
}) {
  return (
    <article className="nf-task">
      <header>
        <span className="nf-task__number">{order}</span>
        <div>
          <h2>{task.title}</h2>
          <Badge>{task.photoRequired ? 'Foto obligatoria' : 'Foto opcional'}</Badge>
        </div>
      </header>
      <div className="nf-actions" role="group" aria-label={`Resultado de ${task.title}`}>
        <Button
          variant="secondary"
          aria-pressed={answer?.result === 'conforme'}
          onClick={onConforming}
        >
          ✓ Conforme
        </Button>
        <Button
          variant="secondary"
          aria-pressed={answer?.result === 'no_conforme'}
          onClick={onNonConforming}
        >
          ! No conforme
        </Button>
      </div>
      {answer?.observation && (
        <p>
          <strong>Observación:</strong> {answer.observation}
        </p>
      )}
      <EvidenceGallery ids={answer?.evidenceIds ?? []} onRemove={onRemove} />
      <Button variant="secondary" onClick={onCamera}>
        {answer?.evidenceIds.length ? 'Repetir fotografía' : 'Tomar foto'}
      </Button>
    </article>
  )
}
