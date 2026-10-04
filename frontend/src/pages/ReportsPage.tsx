import { useCallback, useState } from 'react'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { QueryFeedback } from '../components/feedback/QueryFeedback'
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  ResponsiveTable,
  Select,
} from '../components/ui'
import { errorMessage } from '../services/errors'
import { operationDate, displayDate } from '../utils/dates'
import { visitStatusLabels } from '../types/models'

export default function ReportsPage() {
  const repos = useRepositories()
  const [period, setPeriod] = useState(operationDate().slice(0, 7))
  const [clientId, setClientId] = useState(0)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const query = useQuery(
    useCallback(
      async (signal) => {
        if (!repos.reports) throw new Error('Falta repositorio de reportes.')
        const [dashboard, visits] = await Promise.all([
          repos.dashboard.get({ period: period + '-01', clientId: clientId || undefined, signal }),
          repos.reports.list(period + '-01', clientId || undefined),
        ])
        return { dashboard, visits }
      },
      [repos, period, clientId],
    ),
  )
  const duration = (seconds?: number) =>
    seconds === undefined ? 'No registrado' : (seconds / 60).toFixed(1) + ' min'
  return (
    <>
      <PageHeader
        title="Indicadores y reportes"
        description="Los tiempos de intervención y de registro son distintos. Solo los cierres aceptados cuentan como cumplimiento."
      />
      <QueryFeedback query={query} />
      <Card>
        <div className="nf-filters">
          <Input
            label="Período del reporte"
            type="month"
            required
            value={period}
            onChange={(event) => {
              if (event.target.value) setPeriod(event.target.value)
            }}
          />
          <Select
            label="Cliente del reporte"
            value={clientId}
            onChange={(event) => setClientId(Number(event.target.value))}
          >
            <option value={0}>Toda mi cartera</option>
            {query.data?.dashboard.clients?.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
          <Button
            disabled={exporting}
            onClick={() => {
              if (!repos.reports) return
              setExporting(true)
              setError('')
              void repos.reports
                .export(period + '-01', clientId || undefined)
                .then((blob) => {
                  const url = URL.createObjectURL(blob)
                  const link = document.createElement('a')
                  link.href = url
                  link.download = 'intervenciones-' + period + '.csv'
                  link.click()
                  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
                })
                .catch((cause) => setError(errorMessage(cause)))
                .finally(() => setExporting(false))
            }}
          >
            Exportar CSV
          </Button>
        </div>
        {error && <Alert>{error}</Alert>}
      </Card>
      {query.status !== 'success' || !query.data ? (
        <QueryState query={query} showHeading={false} />
      ) : (
        <>
          <div className="nf-two-columns">
            <Card title="Cumplimiento mensual">
              <p className="nf-metric">
                {query.data.dashboard.compliance === null
                  ? 'Sin cuota aplicable'
                  : query.data.dashboard.compliance.toFixed(1) + '%'}
              </p>
              <p>Pendientes: {query.data.dashboard.pendingVisits}</p>
            </Card>
            <Card title="Revisiones pendientes">
              <p className="nf-metric">{query.data.dashboard.pendingExceptions}</p>
              <p>
                Reporte a resolución:{' '}
                {query.data.dashboard.averageHours === null
                  ? 'Sin datos'
                  : query.data.dashboard.averageHours.toFixed(1) + ' h'}
              </p>
              <p>SLA: pendiente de definición.</p>
            </Card>
          </div>
          <Card title="Atenciones mensuales por tienda">
            <p>
              Cada tienda requiere al menos dos atenciones de tickets finalizadas al mes. El
              checklist mensual se cuenta por separado.
            </p>
            {!query.data.dashboard.risks.length && <p>No hay tiendas en este período y filtro.</p>}
            <ResponsiveTable
              caption="Mínimo de tickets por tienda"
              rows={query.data.dashboard.risks}
              rowKey={(row) => row.storeId}
              columns={[
                {
                  label: 'Tienda',
                  render: (row) => (
                    <>
                      <strong>{row.store}</strong>
                      <p>{row.client}</p>
                    </>
                  ),
                },
                {
                  label: 'Atenciones aceptadas',
                  render: (row) => `${row.completed} / ${row.required}`,
                },
                { label: 'Faltan', render: (row) => row.missing },
                {
                  label: 'Estado',
                  render: (row) => <Badge>{row.missing ? 'Pendiente' : 'Mínimo cumplido'}</Badge>,
                },
              ]}
            />
          </Card>
          <ResponsiveTable
            caption="Tiempos y excepciones por intervención"
            rows={query.data.visits}
            rowKey={(visit) => visit.id}
            columns={[
              {
                label: 'Visita',
                render: (visit) => (
                  <>
                    <strong>
                      #{visit.id} · {visit.origin}
                    </strong>
                    {visit.quota && (
                      <p>
                        Visita mensual {visit.quota} de {visit.quotaCount}
                      </p>
                    )}
                    <p>Inicio: {displayDate(visit.startedAt)}</p>
                    <p>Apertura: {displayDate(visit.formOpenedAt)}</p>
                  </>
                ),
              },
              {
                label: 'Estado',
                render: (visit) => <Badge>{visitStatusLabels[visit.status]}</Badge>,
              },
              {
                label: 'Duraciones',
                render: (visit) => (
                  <>
                    <p>Intervención: {duration(visit.totalSeconds)}</p>
                    <p>Previo al formulario: {duration(visit.executionSeconds)}</p>
                    <p>Registro: {duration(visit.registrationSeconds)}</p>
                  </>
                ),
              },
              {
                label: 'Excepciones',
                render: (visit) => (
                  <>
                    {(visit.exceptions ?? []).map((item) => (
                      <p key={item.id}>
                        {item.type === 'time_limit' ? 'Tiempo' : 'GPS'}:{' '}
                        {item.approved === undefined
                          ? 'Pendiente'
                          : item.approved
                            ? 'Aprobada'
                            : 'Rechazada'}
                      </p>
                    ))}
                  </>
                ),
              },
            ]}
          />
        </>
      )}
    </>
  )
}
