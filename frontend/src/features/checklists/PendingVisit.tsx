import type { Visit } from '../../types/models'
import { Card, Button } from '../../components/ui'
import { displayDate } from '../../utils/dates'
import { VisitRecord } from './VisitRecord'
export function PendingVisit({ initial }: { initial: Visit }) {
  return (
    <>
      <Card title="En revisión">
        <p>Enviado el {displayDate(initial.submittedAt)}. Espera la decisión del supervisor.</p>

        <Button variant="secondary" onClick={() => window.location.reload()}>
          Actualizar estado
        </Button>
      </Card>
      <VisitRecord visit={initial} />
    </>
  )
}
