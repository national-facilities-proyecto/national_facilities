import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { useRepositories } from '../../app/RepositoriesProvider'
import type { Answer, Coordinates, Evidence, Visit } from '../../types/models'
import { registrationEditable } from '../../types/models'
import { AppError, errorMessage } from '../../services/errors'
import { LocationError } from '../geolocation/location'
import { useLocationRequest } from '../geolocation/useLocation'
import { pendingItems } from './validation'
import { formExpired } from './clock'
import { useAuth } from '../auth/AuthProvider'

type Step =
  | { kind: 'editing' }
  | { kind: 'observation'; taskId: number }
  | { kind: 'camera'; taskId?: number }
  | { kind: 'validating' }
  | { kind: 'confirm_finish'; location: Coordinates }
  | { kind: 'location_error'; message: string; failure: string }
  | { kind: 'exception'; failure: string }
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
  const [corrections, setCorrections] = useState<
    Partial<Record<'time_limit' | 'location', string>>
  >({})
  const [exceptionBusy, setExceptionBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [remote, setRemote] = useState<Visit>()
  const [pendingPhoto, setPendingPhoto] = useState<{ photo: Evidence; taskId?: number }>()
  const version = useRef(0)
  const latest = useRef(visit)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const mounted = useRef(true)
  const location = useLocationRequest()
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
  const save = useCallback(async () => {
    const capturedVersion = version.current
    const snapshot = latest.current
    setSaving(true)
    const request = saveQueue.current
      .catch(() => undefined)
      .then(async () => {
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
        }
      })
    saveQueue.current = request
    try {
      await request
      if (mounted.current && capturedVersion === version.current) {
        setDirty(false)
        setError('')
      }
    } catch (cause) {
      if (mounted.current) {
        setError(errorMessage(cause))
        setDirty(true)
      }
      if (cause instanceof AppError && cause.code === 'conflict') setConflict(true)
      throw cause
    } finally {
      if (mounted.current) setSaving(false)
    }
  }, [repos])
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
    const oldIds = taskId
      ? (latest.current.answers.find((answer) => answer.taskId === taskId)?.evidenceIds ?? [])
      : latest.current.evidenceIds
    await repos.evidence.put({ ...photo, taskId, visitId: latest.current.id })
    if (taskId) patchAnswer(taskId, { evidenceIds: [...new Set([...oldIds, photo.id])] })
    else update({ evidenceIds: [...new Set([...oldIds, photo.id])] })
    await save()
    setPendingPhoto(undefined)
  }
  const remove = (id: string, taskId?: number) => {
    void repos.evidence
      .remove(id)
      .then(() => {
        if (taskId) {
          const answer = latest.current.answers.find((item) => item.taskId === taskId)
          patchAnswer(taskId, {
            evidenceIds: answer?.evidenceIds.filter((item) => item !== id) ?? [],
          })
        } else update({ evidenceIds: latest.current.evidenceIds.filter((item) => item !== id) })
        void save().catch(() => undefined)
      })
      .catch((cause) => setError(errorMessage(cause)))
  }
  const finish = async () => {
    if (step.kind !== 'editing' || saving) return
    if (formExpired(latest.current) && latest.current.status !== 'pending_approval') {
      setStep({ kind: 'time_exception' })
      return
    }
    const pending = pendingItems(latest.current)
    if (pending.length) {
      setError(pending.join(' '))
      return
    }
    if (formExpired(visit) && visit.status !== 'pending_approval') {
      setStep({ kind: 'time_exception' })
      return
    }
    setStep({ kind: 'validating' })
    setError('')
    try {
      await save()
      const coordinates = await location.request()
      setStep({ kind: 'confirm_finish', location: coordinates })
    } catch (cause) {
      if (cause instanceof AppError && cause.code === 'unauthorized') {
        setStep({ kind: 'editing' })
        return
      }
      setStep({
        kind: 'location_error',
        message: errorMessage(cause),
        failure: cause instanceof LocationError ? cause.reason : 'service',
      })
    }
  }
  const confirmFinish = async (coordinates: Coordinates) => {
    if (saving) return
    setStep({ kind: 'validating' })
    try {
      let next: Visit
      if (latest.current.status === 'pending_approval') {
        if (!repos.visits.submitReview) throw new Error('Falta envío del registro para revisión.')
        next = await repos.visits.submitReview(visit.id, reviewInput(coordinates))
      } else next = await repos.visits.complete(visit.id, coordinates)
      setVisit(next)
      latest.current = next
      setDirty(false)
      setStep({ kind: 'success', pending: next.status === 'pending_approval' })
    } catch (cause) {
      if (cause instanceof AppError && cause.code === 'unauthorized') {
        setError(errorMessage(cause))
        setStep({ kind: 'editing' })
        return
      }
      if (formExpired(visit) && visit.status !== 'pending_approval') {
        setStep({ kind: 'time_exception' })
        return
      }
      setStep({
        kind: 'location_error',
        message: errorMessage(cause),
        failure: cause instanceof LocationError ? cause.reason : 'service',
      })
    }
  }
  const issues = pendingItems(visit)
  const doneTasks = visit.tasks.filter(
    (task) => !pendingItems({ ...visit, tasks: [task] }).length,
  ).length
  const editable = registrationEditable(visit)
  const reviewInput = (coordinates?: Coordinates, gpsFailure?: string, gpsReason?: string) => {
    const current = latest.current
    const exceptions = (current.exceptions ?? []).map((item) => ({
      type: item.type,
      reason: corrections[item.type] ?? item.reason,
      failure: item.failure,
      revision: item.revision ?? 0,
    }))
    if (formExpired(current) && !exceptions.some((item) => item.type === 'time_limit'))
      exceptions.push({
        type: 'time_limit',
        reason: corrections.time_limit ?? '',
        failure: '',
        revision: 0,
      })
    if (gpsFailure) {
      const previous = exceptions.find((item) => item.type === 'location')
      if (previous) {
        previous.reason = gpsReason ?? ''
        previous.failure = gpsFailure
      } else
        exceptions.push({
          type: 'location',
          reason: gpsReason ?? '',
          failure: gpsFailure,
          revision: 0,
        })
    }
    return { revision: confirmedRevision.current, location: coordinates, exceptions }
  }
  const openForm = async () => {
    setError('')
    setSaving(true)
    try {
      if (!repos.visits.openForm) throw new Error('Falta apertura de formulario.')
      const next = await repos.visits.openForm(visit.id)
      latest.current = next
      confirmedRevision.current = next.revision ?? 0
      setVisit(next)
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
