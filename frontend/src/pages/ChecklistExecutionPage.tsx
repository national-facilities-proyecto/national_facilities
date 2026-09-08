import { ChevronLeft, ClipboardCheck, MapPin, Navigation } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CameraModal } from '../features/technician/CameraModal'
import { checklistTasks, demoStores } from '../features/technician/data'
import { ChecklistTaskCard } from '../components/ChecklistTaskCard'
import { ObservationDialog } from '../components/ObservationDialog'
import { LocationResultModal, type LocationResult } from '../components/LocationResultModal'
import { requestFreshLocation as requestBrowserLocation, requestMockLocation, GeolocationError } from '../services/geolocationService'
import { completeVisitMock, requestLocationExceptionMock } from '../services/visitService'
import { getTechnicianLocation } from '../services/technicianLocationStore'
import type { ChecklistAnswer } from '../types/domain'

// El flujo productivo permanece en modo simulado hasta que exista el contrato GPS del backend.
const requestFreshLocation = import.meta.env.MODE === 'test' ? requestBrowserLocation : () => Promise.resolve(getTechnicianLocation() ?? requestMockLocation())

export default function ChecklistExecutionPage() {
  const { id } = useParams(); const navigate = useNavigate(); const store = demoStores.find((item) => item.id === Number(id)) ?? demoStores[0]
  const [answers, setAnswers] = useState<Record<number, ChecklistAnswer>>({}); const [camera, setCamera] = useState<number | null>(null); const [observation, setObservation] = useState<number | null>(null); const [error, setError] = useState(''); const [result, setResult] = useState<LocationResult | null>(null); const [exception, setException] = useState(false); const [reason, setReason] = useState(''); const [loading, setLoading] = useState(false)
  const update = (taskId: number, patch: Partial<ChecklistAnswer>) => { setError(''); setAnswers((current) => ({ ...current, [taskId]: { ...current[taskId], ...patch, responseItemId: taskId } })) }
  const finish = async () => { const missingResult = checklistTasks.some((task) => !answers[task.id]?.result); const missingPhoto = checklistTasks.some((task) => task.photoRequired && !answers[task.id]?.evidence); const missingObservation = checklistTasks.some((task) => answers[task.id]?.result === 'no_conforme' && !answers[task.id]?.observation?.trim()); if (missingResult || missingPhoto || missingObservation) { setError(missingResult ? 'Completa el resultado de cada tarea.' : missingPhoto ? 'Faltan fotografías obligatorias.' : 'Las tareas no conformes requieren observación.'); return }; setLoading(true); try { const coordinates = await requestFreshLocation(); const completion = await completeVisitMock(Number(id), { coordinates, answers: Object.values(answers) }); setResult({ kind: 'success', title: 'Checklist completado', message: `Simulación backend: ubicación validada a ${completion.distanceMeters} m de la tienda (radio permitido: ${completion.allowedRadiusMeters} m).` }) } catch (cause) { setException(true); const gpsFailure = cause instanceof GeolocationError; setResult({ kind: 'error', title: gpsFailure ? 'Ubicación no disponible' : 'Ubicación fuera del radio', message: cause instanceof Error ? cause.message : 'No fue posible validar la proximidad.' }); if (cause instanceof GeolocationError) void cause.reason } finally { setLoading(false) } }
  const submitException = async () => { try { await requestLocationExceptionMock(Number(id), reason); setException(false); setResult({ kind: 'success', title: 'Pendiente de validación', message: 'Simulación backend: la visita quedó pendiente de aprobación del supervisor.' }) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ingresa una justificación.') } }
  const completedTasks = checklistTasks.filter((task) => Boolean(answers[task.id]?.result)).length
  const pendingTasks = checklistTasks.length - completedTasks
  const validationIssues = checklistTasks.flatMap((task) => {
    const answer = answers[task.id]
    const issues: string[] = []
    if (!answer?.result) issues.push(`Falta completar el resultado de “${task.title}”.`)
    if (task.photoRequired && !answer?.evidence) issues.push(`Falta la fotografía obligatoria de “${task.title}”.`)
    if (answer?.result === 'no_conforme' && !answer.observation?.trim()) issues.push(`Falta la observación de “${task.title}” porque está marcada como No conforme.`)
    return issues
  })
  const missingResultTasks = checklistTasks.filter((task) => !answers[task.id]?.result).map((task) => task.title)
  const missingPhotoTasks = checklistTasks.filter((task) => task.photoRequired && !answers[task.id]?.evidence).map((task) => task.title)
  const missingObservationTasks = checklistTasks.filter((task) => answers[task.id]?.result === 'no_conforme' && !answers[task.id]?.observation?.trim()).map((task) => task.title)
  const validationSummary = [
    missingResultTasks.length > 0 ? `Resultados pendientes: ${missingResultTasks.join(', ')}` : '',
    missingPhotoTasks.length > 0 ? `Fotos pendientes: ${missingPhotoTasks.join(', ')}` : '',
    missingObservationTasks.length > 0 ? `Observaciones pendientes: ${missingObservationTasks.join(', ')}` : '',
  ].filter(Boolean)

  return <>
    <div className="checklist-breadcrumb"><button className="back-link" onClick={() => navigate('/checklists')}><ChevronLeft size={17} aria-hidden="true" /> Mis checklist</button><span aria-hidden="true">/</span><span>Ejecutar checklist</span></div>
    <header className="detail-heading checklist-heading">
      <div><span className="eyebrow">Checklist de actividades</span><h1>{store.name}</h1><p className="checklist-store-address"><MapPin size={16} aria-hidden="true" /> {store.address}</p><p className="checklist-contact"><strong>Encargado:</strong> {store.contact}</p><a className="action-button action-button--ghost checklist-directions" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`}><Navigation size={16} aria-hidden="true" /> Cómo llegar</a></div>
      <div className="checklist-progress" aria-label={`${completedTasks} de ${checklistTasks.length} tareas completadas`}><div className="checklist-progress__label"><span>Progreso</span><strong>{completedTasks} de {checklistTasks.length} tareas completadas</strong></div><div className="checklist-progress__track"><span style={{ width: `${(completedTasks / checklistTasks.length) * 100}%` }} /></div></div>
    </header>
    <section className="task-list" aria-label="Tareas del checklist">{checklistTasks.map((task, index) => <ChecklistTaskCard key={task.id} task={task} order={index + 1} answer={answers[task.id]} onConforming={() => update(task.id, { result: 'conforme', observation: '' })} onNonConforming={() => setObservation(task.id)} onCamera={() => setCamera(task.id)} onRemove={() => { const evidence = answers[task.id]?.evidence; if (evidence) URL.revokeObjectURL(evidence.objectUrl); update(task.id, { evidence: undefined }) }} />)}</section>
    <div className="checklist-summary">{error && <div className="checklist-summary__error" role="alert" aria-live="polite"><strong>{error}</strong>{validationIssues.length > 0 && <ul>{validationSummary.map((issue) => <li key={issue}>{issue}</li>)}</ul>}</div>}<div className="checklist-summary__row"><div className="checklist-summary__counts"><ClipboardCheck size={19} aria-hidden="true" /><span><strong>{completedTasks}</strong> completadas</span><span className="checklist-summary__pending"><strong>{pendingTasks}</strong> pendientes</span></div><button className="action-button action-button--primary" disabled={loading} onClick={finish}>{loading ? 'Validando ubicación…' : 'Finalizar checklist'}</button></div></div>
    <ObservationDialog open={observation !== null} initialValue={observation === null ? '' : answers[observation]?.observation ?? ''} onCancel={() => setObservation(null)} onSave={(value) => { if (observation !== null) update(observation, { result: 'no_conforme', observation: value }); setObservation(null) }} /><CameraModal open={camera !== null} onClose={() => setCamera(null)} onCapture={(photo) => { if (camera !== null) update(camera, { evidence: { id: crypto.randomUUID(), responseItemId: camera, objectUrl: photo, mimeType: 'image/jpeg', size: 0 } }); setCamera(null) }} /><LocationResultModal result={result} onClose={() => { setResult(null); navigate('/checklists') }} />{exception && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><h2>Excepción de ubicación</h2><p>Escribe una justificación; la visita quedará pendiente_validacion.</p><textarea className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} required /><div className="modal__actions"><button className="action-button action-button--ghost" onClick={() => setException(false)}>Cancelar</button><button className="action-button action-button--primary" disabled={!reason.trim()} onClick={submitException}>Enviar justificación</button></div></section></div>}
  </>
}
