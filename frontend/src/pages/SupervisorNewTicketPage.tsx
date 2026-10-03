import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { Alert, Button, Card, PageHeader, Select, Textarea } from '../components/ui'
import { EvidenceGallery } from '../components/EvidenceGallery'
import type { Priority } from '../types/models'
import { validateFiles } from '../services/evidence'
import { AppError, errorMessage } from '../services/errors'
export default function SupervisorNewTicketPage() {
  const repos = useRepositories()
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<Priority>('')
  const [description, setDescription] = useState('')
  const [storeId, setStoreId] = useState(0)
  const [ids, setIds] = useState<string[]>([])
  const ownedIds = useRef<string[]>([])
  const recovered = useRef(false)
  const mounted = useRef(true)
  const [pendingFiles, setPendingFiles] = useState<{ id: string; file: File }[]>([])
  const [fields, setFields] = useState<Record<string, string[]>>({})
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const query = useQuery(
    useCallback(
      async (signal) => {
        if (!repos.tickets.catalogs) throw new Error('Falta catálogo de tickets.')
        const [stores, catalogs, temporary] = await Promise.all([
          repos.stores.list({ signal }),
          repos.tickets.catalogs(),
          repos.evidence.listTemporary(),
        ])
        return { stores, catalogs, temporary }
      },
      [repos],
    ),
    false,
  )
  useEffect(() => {
    const confirmed = query.data
    if (confirmed && !recovered.current) {
      recovered.current = true
      ownedIds.current = confirmed.temporary
      setIds((current) => [...new Set([...current, ...confirmed.temporary])])
    }
  }, [query.data])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [repos])
  const sendFiles = async (queue: { id: string; file: File }[], fileErrors: string[] = []) => {
    if (uploading || saving) return
    setUploading(true)
    try {
      for (const { file, id } of queue) {
        await repos.evidence.put({
          id,
          blob: file,
          name: file.name,
          mimeType: file.type,
          size: file.size,
          source: 'upload',
        })
        if (!mounted.current) break
        if (!ownedIds.current.includes(id)) ownedIds.current.push(id)
        setIds((current) => (current.includes(id) ? current : [...current, id]))
        setPendingFiles((current) => current.filter((item) => item.id !== id))
      }
      setErrors(fileErrors)
    } catch (cause) {
      setErrors([...fileErrors, errorMessage(cause)])
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }
  const addFiles = (files: File[]) => {
    if (uploading || saving || pendingFiles.length) return
    const { accepted, errors: fileErrors } = validateFiles(files, ids.length)
    const queue = accepted.map((file) => ({ file, id: crypto.randomUUID() }))
    setPendingFiles(queue)
    void sendFiles(queue, fileErrors)
  }
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (description || ids.length || pendingFiles.length || saving || uploading) {
        event.preventDefault()
      }
    }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [description, ids.length, pendingFiles.length, saving, uploading])
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  return (
    <>
      <PageHeader
        title="Registrar nueva incidencia"
        description="Describe el problema y adjunta fotografías de tu tienda."
      />
      <Card>
        {query.data.temporary.length > 0 && (
          <Alert success>
            Fotografías confirmadas de un reporte pendiente recuperadas del servidor. Puedes
            utilizarlas o retirarlas antes de enviar.
          </Alert>
        )}
        <form
          className="nf-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (saving || uploading || pendingFiles.length) return
            if (!category || !priority || description.trim().length < 10) {
              setErrors([
                'Completa especialidad, prioridad y una descripción de al menos 10 caracteres.',
              ])
              return
            }
            setSaving(true)
            setErrors([])
            setFields({})
            void repos.tickets
              .create({
                category,
                priority,
                description: description.trim(),
                storeId: storeId || query.data?.stores.find((store) => store.active)?.id || 0,
                evidenceIds: ids,
              })
              .then((ticket) => {
                void navigate(`/supervisor/tickets/${ticket.id}`)
              })
              .catch((cause) => {
                setErrors([errorMessage(cause)])
                setFields(cause instanceof AppError ? cause.fields : {})
              })
              .finally(() => setSaving(false))
          }}
        >
          <div className="nf-two-columns">
            <Select
              label="Tienda"
              errors={fields.storeId}
              value={storeId || query.data.stores.find((store) => store.active)?.id || 0}
              onChange={(event) => setStoreId(Number(event.target.value))}
            >
              {query.data.stores
                .filter((store) => store.active)
                .map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
            </Select>
            <Select
              label="Especialidad"
              errors={fields.categoryId}
              required
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Seleccionar especialidad</option>
              {query.data.catalogs.categories.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Select
              label="Prioridad"
              errors={fields.priorityId}
              required
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              <option value="">Seleccionar prioridad</option>
              {query.data.catalogs.priorities.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            label="Descripción del problema"
            errors={fields.description}
            minLength={10}
            maxLength={500}
            required
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <p>{description.length}/500 caracteres</p>
          <div
            className="nf-upload"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              void addFiles(Array.from(event.dataTransfer.files))
            }}
          >
            <p>Fotografías del reporte · Hasta 5 archivos de 5 MB</p>
            <input
              ref={input}
              type="file"
              aria-label="Fotografías del reporte"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) void addFiles(Array.from(event.target.files))
              }}
            />
            <Button
              variant="secondary"
              disabled={uploading || saving || pendingFiles.length > 0}
              onClick={() => input.current?.click()}
            >
              {uploading ? 'Guardando fotografías…' : 'Seleccionar fotografías'}
            </Button>
            <p>JPG, PNG o WebP. También puedes arrastrar archivos aquí.</p>
          </div>
          <EvidenceGallery
            ids={ids}
            onRemove={(id) => {
              if (saving || uploading) return
              setUploading(true)
              void repos.evidence
                .remove(id)
                .then(() => {
                  setIds((current) => current.filter((value) => value !== id))
                  ownedIds.current = ownedIds.current.filter((value) => value !== id)
                })
                .catch((cause) => setErrors([errorMessage(cause)]))
                .finally(() => setUploading(false))
            }}
          />
          {pendingFiles.length > 0 && (
            <Alert>
              Hay fotografías pendientes de confirmar. Conserva esta página y reintenta la carga.
              <Button disabled={saving || uploading} onClick={() => void sendFiles(pendingFiles)}>
                Reintentar carga
              </Button>
            </Alert>
          )}
          {errors.map((error) => (
            <Alert key={error}>{error}</Alert>
          ))}
          <div className="nf-actions">
            <Button
              type="submit"
              disabled={
                saving ||
                uploading ||
                pendingFiles.length > 0 ||
                !query.data.stores.some((store) => store.active)
              }
            >
              {saving ? 'Enviando…' : 'Enviar reporte'}
            </Button>
            <Button
              variant="secondary"
              disabled={saving || uploading}
              onClick={() => void navigate('/supervisor/tickets')}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </>
  )
}
