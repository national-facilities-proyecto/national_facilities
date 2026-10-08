import type { Visit } from '../../types/models'
import { Card } from '../../components/ui'
import { ExceptionSummary } from './ExceptionSummary'
import { VisitResults } from './VisitResults'

export function VisitRecord({ visit }: { visit: Visit }) {
  const exceptions = visit.exceptions?.length
    ? visit.exceptions
    : visit.exception
      ? [visit.exception]
      : []
  return (
    <>
      {exceptions.map((item, index) => (
        <ExceptionSummary key={item.id ?? index} item={item} />
      ))}
      <Card
        title={visit.origin === 'checklist' ? 'Resultados del checklist' : 'Resultado del trabajo'}
      >
        <VisitResults visit={visit} />
      </Card>
    </>
  )
}
