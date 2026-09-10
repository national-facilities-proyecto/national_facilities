import { Button, Card, Input } from '../../components/ui'
import type { ChecklistTask } from '../../types/models'

export function TemplateItems({
  tasks,
  setTasks,
}: {
  tasks: ChecklistTask[]
  setTasks(
    this: void,
    value: ChecklistTask[] | ((current: ChecklistTask[]) => ChecklistTask[]),
  ): void
}) {
  return (
    <fieldset>
      <legend>Ítems de la plantilla</legend>
      {tasks.map((task, index) => (
        <Card key={task.id}>
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
          <label className="nf-check">
            <input
              type="checkbox"
              checked={task.photoRequired}
              onChange={(event) =>
                setTasks((current) =>
                  current.map((item) =>
                    item.id === task.id ? { ...item, photoRequired: event.target.checked } : item,
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
          <Button
            variant="secondary"
            disabled={index === 0}
            onClick={() =>
              setTasks((current) => {
                const next = [...current]
                const previous = next[index - 1]
                if (previous) {
                  next[index - 1] = task
                  next[index] = previous
                }
                return next
              })
            }
          >
            Subir ítem
          </Button>
        </Card>
      ))}
      <Button
        variant="secondary"
        onClick={() =>
          setTasks((current) => [
            ...current,
            {
              id: Math.max(0, ...current.map((task) => task.id)) + 1,
              title: '',
              active: true,
              photoRequired: true,
              order: current.length + 1,
            },
          ])
        }
      >
        Agregar ítem
      </Button>
    </fieldset>
  )
}
