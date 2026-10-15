import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button, EmptyState, Input } from '../../components/ui'
import type { ChecklistTask } from '../../types/models'
import { newTemplateTask } from './templateDraft'

export function TemplateItems({
  tasks,
  setTasks,
  showAddButton = true,
}: {
  tasks: ChecklistTask[]
  setTasks(
    this: void,
    value: ChecklistTask[] | ((current: ChecklistTask[]) => ChecklistTask[]),
  ): void
  showAddButton?: boolean
}) {
  const move = (index: number, offset: number) => {
    setTasks((current) => {
      const next = [...current]
      const target = index + offset
      const task = next[index]
      const other = next[target]
      if (task && other) {
        next[index] = other
        next[target] = task
      }
      return next
    })
  }
  return (
    <fieldset className="nf-template-items">
      <legend>Ítems de la plantilla</legend>
      <p className="nf-template-items__hint">
        {tasks.length} {tasks.length === 1 ? 'ítem' : 'ítems'} · Define la descripción, la
        fotografía requerida y el orden de revisión.
      </p>
      {!tasks.length && <EmptyState>Agrega el primer ítem para empezar tu plantilla.</EmptyState>}
      {tasks.map((task, index) => (
        <div className="nf-template-item" key={task.id} data-template-item-id={task.id}>
          <div className="nf-template-item__content">
            <Input
              label={`Ítem ${index + 1}`}
              value={task.title}
              required
              onChange={(event) =>
                setTasks((current) =>
                  current.map((item) =>
                    item.id === task.id ? { ...item, title: event.target.value } : item,
                  ),
                )
              }
            />
            <div className="nf-template-item__options">
              <label className="nf-check">
                <input
                  type="checkbox"
                  checked={task.photoRequired}
                  aria-label={`Foto obligatoria del ítem ${index + 1}`}
                  onChange={(event) =>
                    setTasks((current) =>
                      current.map((item) =>
                        item.id === task.id
                          ? { ...item, photoRequired: event.target.checked }
                          : item,
                      ),
                    )
                  }
                />
                Foto obligatoria
              </label>
              <label className="nf-check">
                <input
                  type="checkbox"
                  checked={task.active}
                  aria-label={`Ítem ${index + 1} activo`}
                  onChange={(event) =>
                    setTasks((current) =>
                      current.map((item) =>
                        item.id === task.id ? { ...item, active: event.target.checked } : item,
                      ),
                    )
                  }
                />
                Ítem activo
              </label>
            </div>
          </div>
          <div
            className="nf-template-item__order"
            role="group"
            aria-label={`Orden del ítem ${index + 1}`}
          >
            <Button
              variant="secondary"
              disabled={index === 0}
              aria-label={`Subir ítem ${index + 1}`}
              title="Subir ítem"
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={18} aria-hidden="true" />
            </Button>
            <Button
              variant="secondary"
              disabled={index === tasks.length - 1}
              aria-label={`Bajar ítem ${index + 1}`}
              title="Bajar ítem"
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={18} aria-hidden="true" />
            </Button>
          </div>
        </div>
      ))}
      {showAddButton && (
        <Button
          variant="secondary"
          onClick={() => setTasks((current) => [...current, newTemplateTask(current)])}
        >
          Agregar ítem
        </Button>
      )}
    </fieldset>
  )
}
