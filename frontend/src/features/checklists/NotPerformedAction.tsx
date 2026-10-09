import { useId, useState } from 'react'
import type { Visit } from '../../types/models'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Button, Textarea } from '../../components/ui'
import { Modal } from '../../components/ui/Modal'
import { errorMessage } from '../../services/errors'
import { canMarkNotPerformed } from './notPerformed'

export function NotPerformedAction({
  visit,
  disabled = false,
  submit,
  onConfirmed,
}: {
  visit: Visit
  disabled?: boolean
  submit?: (reason: string) => Promise<Visit>
  onConfirmed?: (visit: Visit) => void
}) {
  const helpId = useId()
  const { visits } = useRepositories()
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!canMarkNotPerformed(visit, session?.user.role)) return null
  return (
    <>
      <aside className="nf-not-performed" aria-label="Acción excepcional">
        <span id={helpId} className="sr-only">
          Úsalo si no se pudo realizar el trabajo; requiere un motivo.
        </span>
        <Button
          variant="secondary"
          className="nf-button--quiet"
          aria-describedby={helpId}
          disabled={disabled || busy}
          onClick={() => {
            setOpen(true)
            setError('')
          }}
        >
          No pude realizar el trabajo
        </Button>
      </aside>
      <Modal
        open={open}
        title="Marcar como no realizado"
        busy={busy}
        onClose={() => setOpen(false)}
      >
        <p>No realizado no cuenta como trabajo completado.</p>
        <Textarea
          label="Motivo"
          required
          minLength={10}
          maxLength={500}
          value={reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
        />
        {error && <Alert>{error}</Alert>}
        <div className="nf-actions nf-modal-actions">
          <Button
            variant="danger"
            disabled={busy || disabled || reason.trim().length < 10}
            onClick={() => {
              if (busy || reason.trim().length < 10) return
              setBusy(true)
              setError('')
              void (
                submit ? submit(reason.trim()) : visits.markNotPerformed(visit.id, reason.trim())
              )
                .then((next) => {
                  onConfirmed?.(next)
                  setOpen(false)
                })
                .catch((cause) => setError(errorMessage(cause)))
                .finally(() => setBusy(false))
            }}
          >
            Confirmar no realizado
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </Modal>
    </>
  )
}
