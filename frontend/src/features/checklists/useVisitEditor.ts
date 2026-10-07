import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { useRepositories } from '../../app/RepositoriesProvider'
import type { Answer, Evidence, Visit } from '../../types/models'
import { registrationEditable } from '../../types/models'
import { AppError, errorMessage } from '../../services/errors'
import { pendingItems } from './validation'
import { formExpired } from './clock'
import { useAuth } from '../auth/AuthProvider'

type Step =
  | { kind: 'editing' }
  | { kind: 'observation'; taskId: number; result?: 'no_conforme' | 'no_aplica' }
  | { kind: 'camera'; taskId?: number }
  | { kind: 'validating' }
  | { kind: 'confirm_finish' }
  | { kind: 'time_exception' }
  | { kind: 'success'; pending: boolean }
export function useVisitEditor(initial: Visit) {
  const repos = useRepositories()
  const auth = useAuth()
  const previousAuth = useRef(auth.status)
  const navigate = useNavigate()
  const [visit, setVisit] = useState(initial)
  const [step, setStep] = useState<Step>({ kind: 'editing' })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [corrections, setCorrections] = useState<Record<string, string>>({})
  const [exceptionBusy, setExceptionBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [remote, setRemote] = useState<Visit>()
  const [pendingPhoto, setPendingPhoto] = useState<{ photo: Evidence; taskId?: number }>()
  const version = useRef(0)
  const latest = useRef(visit)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const queuedWrites = useRef(0)
  const evidenceRevisionConflict = useRef(false)
  const mounted = useRef(true)
  const back = visit.origin === 'checklist' ? '/checklists' : '/routes'
  const mustComplete = false
  const confirmedRevision = useRef(initial.revision ?? 0)
  useEffect(() => {
    const recovering = previousAuth.current === 'expired' && auth.status === 'authenticated'
    previousAuth.current = auth.status
    if (!recovering) return
    const capturedVersion = version.current
    void repos.visits
      .get(initial.id)
      .then((confirmed) => {
        if (!mounted.current) return
        const localChanges = dirty || Boolean(pendingPhoto) || capturedVersion !== version.current
        if (
          localChanges &&
          (confirmed.revision !== confirmedRevision.current || !registrationEditable(confirmed))
        ) {
          setRemote(confirmed)
          setConflict(true)
          setError(
            'La sesión se recuperó y el servidor cambió el registro. Conservamos tu editor; consulta y concilia su estado actual.',
          )
          return
        }
        confirmedRevision.current = confirmed.revision ?? 0
        const current = latest.current
        const next = localChanges
          ? {
              ...confirmed,
              answers: current.answers,
              workDescription: current.workDescription,
              evidenceIds: current.evidenceIds,
            }
          : confirmed
        latest.current = next
        setVisit(next)
      })
      .catch((cause) => setError(errorMessage(cause)))
  }, [auth.status, dirty, initial.id, pendingPhoto, repos])
  const blocker = useBlocker(mustComplete || dirty || saving || Boolean(pendingPhoto))
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!mustComplete && !dirty && !saving && !pendingPhoto) return
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty, mustComplete, saving, pendingPhoto])
  const update = (patch: Partial<Visit>) => {
    const next = { ...latest.current, ...patch }
    latest.current = next
    version.current++
    setVisit(next)
    setDirty(true)
    setError('')
  }
  const persistDraft = useCallback(async () => {
    if (evidenceRevisionConflict.current)
      throw new AppError(
        'conflict',
        'Consulta y concilia la versión del servidor antes de guardar.',
      )
    const capturedVersion = version.current
    const snapshot = latest.current
    const confirmed = await repos.checklists.saveDraft(snapshot.id, {
      answers: snapshot.answers,
      workDescription: snapshot.workDescription,
      evidenceIds: snapshot.evidenceIds,
      revision: confirmedRevision.current,
    })
    confirmedRevision.current = confirmed.revision ?? confirmedRevision.current
    if (mounted.current && capturedVersion === version.current) {
      latest.current = confirmed
      setVisit(confirmed)
      setDirty(false)
      setError('')
    }
  }, [repos])
  const enqueueWrite = useCallback(async (work: () => Promise<void>) => {
    queuedWrites.current++
    setSaving(true)
    const request = saveQueue.current.catch(() => undefined).then(work)
    saveQueue.current = request
    try {
      await request
    } catch (cause) {
      if (mounted.current) {
        setError(errorMessage(cause))
        setDirty(true)
      }
      if (cause instanceof AppError && cause.code === 'conflict') setConflict(true)
      throw cause
    } finally {
      queuedWrites.current--
      if (mounted.current) setSaving(queuedWrites.current > 0)
    }
  }, [])
  const save = useCallback(() => enqueueWrite(persistDraft), [enqueueWrite, persistDraft])
  const consultRemote = async () => {
    try {
      setRemote(await repos.visits.get(visit.id))
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }
  const acceptRemote = () => {
    if (!remote) return
    confirmedRevision.current = remote.revision ?? 0
    evidenceRevisionConflict.current = false
    latest.current = remote
    version.current++
    setVisit(remote)
    setDirty(false)
    setError('')
    setConflict(false)
    setRemote(undefined)
  }
  const reconcile = () => {
    if (!remote) return
    const local = latest.current
    const answers = remote.tasks.map((task) => {
      const ours = local.answers.find((answer) => answer.taskId === task.id)
      const theirs = remote.answers.find((answer) => answer.taskId === task.id)
      return {
        ...(theirs ?? { taskId: task.id, observation: '', evidenceIds: [] }),
        ...ours,
        evidenceIds: theirs?.evidenceIds ?? [],
      }
    })
    confirmedRevision.current = remote.revision ?? 0
    evidenceRevisionConflict.current = false
    setConflict(false)
    setRemote(undefined)
    update({ ...remote, answers, workDescription: local.workDescription })
  }
  useEffect(() => {
    if (!dirty || saving || error || conflict) return
    const timer = setTimeout(() => {
      void save().catch(() => undefined)
    }, 650)
    return () => clearTimeout(timer)
  }, [dirty, saving, save, visit, error, conflict])
  const patchAnswer = (taskId: number, patch: Partial<Answer>) => {
    const current = latest.current.answers.find((answer) => answer.taskId === taskId) ?? {
      taskId,
      observation: '',
      evidenceIds: [],
    }
    update({
      answers: [
        ...latest.current.answers.filter((answer) => answer.taskId !== taskId),
        { ...current, ...patch },
      ],
    })
  }
  const capture = async (photo: Evidence, taskIdOverride?: number) => {
    const taskId = taskIdOverride ?? (step.kind === 'camera' ? step.taskId : undefined)
    setPendingPhoto({ photo, taskId })
    await enqueueWrite(async () => {
      await syncEvidenceRevision(
        () => repos.evidence.put({ ...photo, taskId, visitId: latest.current.id }),
        photo.id,
        true,
        taskId,
      )
      const oldIds = taskId
        ? (latest.current.answers.find((answer) => answer.taskId === taskId)?.evidenceIds ?? [])
        : latest.current.evidenceIds
      if (taskId) patchAnswer(taskId, { evidenceIds: [...new Set([...oldIds, photo.id])] })
      else update({ evidenceIds: [...new Set([...oldIds, photo.id])] })
      await persistDraft()
    })
    setPendingPhoto(undefined)
  }
  const syncEvidenceRevision = async (
    mutation: () => Promise<void>,
    id: string,
    associated: boolean,
    taskId?: number,
  ) => {
    if (evidenceRevisionConflict.current)
      throw new AppError(
        'conflict',
        'Consulta y concilia la versión del servidor antes de cambiar fotografías.',
      )
    const previousRevision = confirmedRevision.current
    await mutation()
    const refreshed = await repos.visits.get(latest.current.id)
    // El mock representa un borrador sin guardados como revisión 0; la API debe dar su versión.
    const refreshedRevision = refreshed.revision ?? (repos.source === 'mock' ? 0 : undefined)
    const ids = taskId
      ? (refreshed.answers.find((answer) => answer.taskId === taskId)?.evidenceIds ?? [])
      : refreshed.evidenceIds
    // POST idempotente no incrementa la revisión. GET debe confirmar la asociación.
    // Las evidencias del repositorio mock son locales y tampoco mutan el borrador.
    const unchanged =
      refreshedRevision === previousRevision &&
      (repos.source === 'mock' || ids.includes(id) === associated)
    if (
      registrationEditable(refreshed) &&
      typeof refreshedRevision === 'number' &&
      (refreshedRevision === previousRevision + 1 || unchanged)
    ) {
      confirmedRevision.current = refreshedRevision
      return
    }
    evidenceRevisionConflict.current = true
    setRemote(refreshed)
    setConflict(true)
    throw new AppError(
      'conflict',
      'La revisión cambió durante la mutación de evidencia. Tu editor se conserva; consulta y concilia la versión del servidor antes de guardar.',
    )
  }
  const remove = (id: string, taskId?: number) => {
    void enqueueWrite(async () => {
      await syncEvidenceRevision(() => repos.evidence.remove(id), id, false, taskId)
      if (taskId) {
        const answer = latest.current.answers.find((item) => item.taskId === taskId)
        patchAnswer(taskId, {
          evidenceIds: answer?.evidenceIds.filter((item) => item !== id) ?? [],
        })
      } else update({ evidenceIds: latest.current.evidenceIds.filter((item) => item !== id) })
      await persistDraft()
    }).catch((cause) => setError(errorMessage(cause)))
  }
  const applyConfirmed = (next: Visit) => {
    latest.current = next
    confirmedRevision.current = next.revision ?? 0
    setVisit(next)
  }
  const needsReview = Boolean(visit.exceptions?.length)
  const finish = async () => {
    if (step.kind !== 'editing' || saving || conflict) return
    const pending = pendingItems(latest.current)
    if (pending.length) {
      setError(pending.join(' '))
      return
    }
    if (
      formExpired(latest.current) &&
      !latest.current.exceptions?.some((item) => item.type === 'time_limit')
    ) {
      setStep({ kind: 'time_exception' })
      return
    }
    setStep({ kind: 'validating' })
    setError('')
    try {
      await save()
      setStep({ kind: 'confirm_finish' })
    } catch {
      setStep({ kind: 'editing' })
    }
  }
  const reviewInput = () => ({
    revision: confirmedRevision.current,
    exceptions: (latest.current.exceptions ?? []).map((item) => ({
      type: item.type,
      scope: item.scope,
      reason: corrections[`${item.type}:${item.scope}`] ?? item.reason,
      failure: item.failure,
      revision: item.revision ?? 0,
    })),
  })
  const confirmFinish = async () => {
    if (saving) return
    setStep({ kind: 'validating' })
    setError('')
    try {
      const current = latest.current
      const next = current.exceptions?.length
        ? await repos.visits.submitReview(current.id, reviewInput())
        : await repos.visits.complete(current.id, {
            revision: confirmedRevision.current,
            exceptions: [],
          })
      applyConfirmed(next)
      setDirty(false)
      setStep({ kind: 'success', pending: next.phase === 'in_review' && Boolean(next.submittedAt) })
    } catch (cause) {
      setError(errorMessage(cause))
      if (cause instanceof AppError && cause.code === 'conflict') setConflict(true)
      setStep({ kind: 'editing' })
    }
  }
  const issues = pendingItems(visit)
  const doneTasks = visit.tasks.filter(
    (task) => !pendingItems({ ...visit, tasks: [task] }).length,
  ).length
  const editable = registrationEditable(visit)
  const openForm = async () => {
    setError('')
    setSaving(true)
    try {
      applyConfirmed(await repos.visits.openForm(visit.id))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  return {
    repos,
    navigate,
    visit,
    setVisit,
    step,
    setStep,
    dirty,
    saving,
    error,
    setError,
    reason,
    setReason,
    exceptionBusy,
    setExceptionBusy,
    latest,
    mustComplete,
    back,
    blocker,
    update,
    save,
    patchAnswer,
    capture,
    remove,
    finish,
    confirmFinish,
    issues,
    doneTasks,
    editable,
    openForm,
    applyConfirmed,
    needsReview,
    conflict,
    remote,
    consultRemote,
    acceptRemote,
    reconcile,
    pendingPhoto,
    corrections,
    setCorrections,
    reviewInput,
  }
}
