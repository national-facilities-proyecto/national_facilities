import type { Visit } from '../../types/models'
import { Card } from '../../components/ui'
import { Disclosure } from '../../components/ui/Disclosure'
import { VisitTiming } from './VisitTiming'
import { ExceptionSummary } from './ExceptionSummary'
import { ExceptionDetails } from './ExceptionDetails'
import { ExceptionHistory } from './ExceptionHistory'
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
      {Boolean(visit.exceptionHistory?.length) && (
        <Disclosure title="Historial de excepciones">
          <ExceptionHistory visit={visit} />
        </Disclosure>
      )}
      <Disclosure title="Detalles técnicos">
        <VisitTiming visit={visit} />
        {exceptions.map((item, index) => (
          <ExceptionDetails key={item.id ?? index} item={item} radius={visit.radiusMeters} />
        ))}
      </Disclosure>
    </>
  )
}
