import type { Visit } from '../../types/models'
import { Card, Button } from '../../components/ui'
import { displayDate } from '../../utils/dates'
import { VisitRecord } from './VisitRecord'
export function PendingVisit({ initial }: { initial: Visit }) {
  return (
    <>
      <Card title="En revisión">
        <p>
          Registro completo enviado: {displayDate(initial.submittedAt)}. Solo lectura mientras el
          supervisor decide.
        </p>
        <p>
          {initial.occupiesTechnician
            ? 'Esta ejecución sigue ocupando al técnico.'
            : 'Puedes comenzar otro trabajo.'}
        </p>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Actualizar estado
        </Button>
      </Card>
      <VisitRecord visit={initial} />
    </>
  )
}
