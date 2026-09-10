import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { Alert, Button, Card, PageHeader, Select, Textarea } from '../components/ui'
import { EvidenceGallery } from '../components/EvidenceGallery'
import type { Priority } from '../types/models'
import { validateFiles } from '../services/evidence'
import { errorMessage } from '../services/errors'
export default function SupervisorNewTicketPage() {
  const repos = useRepositories()
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [description, setDescription] = useState('')
  const [storeId, setStoreId] = useState(0)
  const [ids, setIds] = useState<string[]>([])
  const ownedIds = useRef<string[]>([])
  const submitted = useRef(false)
  const mounted = useRef(true)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const query = useQuery(
    useCallback((signal) => repos.stores.list({ signal }), [repos]),
    false,
  )
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (!submitted.current)
        ownedIds.current.forEach((id) => {
          void repos.evidence.remove(id).catch(() => undefined)
        })
    }
  }, [repos])
  const addFiles = async (files: File[]) => {
    if (uploading || saving) return
    setUploading(true)
    const { accepted, errors: fileErrors } = validateFiles(files, ids.length)
    const newIds: string[] = []
    try {
      for (const file of accepted) {
        const id = crypto.randomUUID()
        await repos.evidence.put({
          id,
          blob: file,
          name: file.name,
          mimeType: file.type,
          size: file.size,
          source: 'upload',
          capturedAt: new Date().toISOString(),
        })
        if (!mounted.current) {
          await repos.evidence.remove(id)
          break
        }
        newIds.push(id)
        ownedIds.current.push(id)
      }
      setErrors(fileErrors)
    } catch (cause) {
      setErrors([...fileErrors, errorMessage(cause)])
    } finally {
      if (mounted.current) setIds((current) => [...current, ...newIds])
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  return (
    <>
      <PageHeader
        title="Registrar nueva incidencia"
        description="Describe el problema y adjunta fotografías de tu tienda."
      />
      <Card>
        <form
          className="nf-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (saving || uploading) return
            if (!category || !priority || description.trim().length < 10) {
              setErrors([
                'Completa especialidad, prioridad y una descripción de al menos 10 caracteres.',
              ])
              return
            }
            setSaving(true)
            setErrors([])
            void repos.tickets
              .create({
                category,
                priority,
                description: description.trim(),
                storeId: storeId || query.data?.[0]?.id || 0,
                evidenceIds: ids,
              })
              .then((ticket) => {
                submitted.current = true
                void navigate(`/supervisor/tickets/${ticket.id}`)
              })
              .catch((cause) => setErrors([errorMessage(cause)]))
              .finally(() => setSaving(false))
          }}
        >
          <div className="nf-two-columns">
            <Select
              label="Tienda"
              value={storeId || query.data[0]?.id || 0}
              onChange={(event) => setStoreId(Number(event.target.value))}
            >
              {query.data.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </Select>
            <Select
              label="Especialidad"
              required
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Seleccionar especialidad</option>
              {['Climatización', 'Eléctrico', 'Plomería', 'Refrigeración'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
            <Select
              label="Prioridad"
              required
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority)}
            >
              <option value="">Seleccionar prioridad</option>
              <option>Alta</option>
              <option>Media</option>
              <option>Baja</option>
            </Select>
          </div>
          <Textarea
            label="Descripción del problema"
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
              disabled={uploading || saving}
              onClick={() => input.current?.click()}
            >
              {uploading ? 'Guardando fotografías…' : 'Seleccionar fotografías'}
            </Button>
            <p>JPG, PNG o WebP. También puedes arrastrar archivos aquí.</p>
          </div>
          <EvidenceGallery
            ids={ids}
            onRemove={(id) => {
              setIds((current) => current.filter((value) => value !== id))
              ownedIds.current = ownedIds.current.filter((value) => value !== id)
              void repos.evidence.remove(id).catch((cause) => setErrors([errorMessage(cause)]))
            }}
          />
          {errors.map((error) => (
            <Alert key={error}>{error}</Alert>
          ))}
          <div className="nf-actions">
            <Button type="submit" disabled={saving || uploading || !query.data.length}>
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
