import { useState } from 'react'
import { Modal } from './ui/Modal'
import { Button, Textarea } from './ui'
type Props = {
  open: boolean
  initialValue: string
  onCancel(this: void): void
  onSave(this: void, value: string): void
}
export function ObservationDialog({ open, ...props }: Props) {
  return open ? <ObservationForm {...props} /> : null
}
function ObservationForm({ initialValue, onCancel, onSave }: Omit<Props, 'open'>) {
  const [value, setValue] = useState(initialValue)
  return (
    <Modal open title="Describe lo encontrado" onClose={onCancel}>
      <form
        className="nf-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (value.trim()) onSave(value.trim())
        }}
      >
        <Textarea
          label="Descripción obligatoria"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          required
          autoFocus
          rows={5}
        />
        <div className="nf-actions">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!value.trim()}>
            Guardar observación
          </Button>
        </div>
      </form>
    </Modal>
  )
}
