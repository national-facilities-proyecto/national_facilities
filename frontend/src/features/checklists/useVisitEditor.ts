import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { useRepositories } from '../../app/RepositoriesProvider'
import type { Answer, Coordinates, Evidence, Store, Visit } from '../../types/models'
import { errorMessage } from '../../services/errors'
import { LocationError } from '../geolocation/location'
import { useLocationRequest } from '../geolocation/useLocation'
import { pendingItems } from './validation'

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
export function useVisitEditor(initial: Visit, store: Store) {
  const repos = useRepositories()
  const navigate = useNavigate()
  const [visit, setVisit] = useState(initial)
  const [step, setStep] = useState<Step>({ kind: 'editing' })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [exceptionBusy, setExceptionBusy] = useState(false)
  const version = useRef(0)
  const latest = useRef(visit)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const mounted = useRef(true)
  const location = useLocationRequest(store)
  const back = visit.origin === 'checklist' ? '/checklists' : '/routes'
  const mustComplete = visit.origin === 'checklist' && visit.status === 'in_progress'
  const blocker = useBlocker(mustComplete || dirty || saving)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!mustComplete && !dirty && !saving) return
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty, mustComplete, saving])
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
        await repos.checklists.saveDraft(snapshot.id, {
          answers: snapshot.answers,
          workDescription: snapshot.workDescription,
          evidenceIds: snapshot.evidenceIds,
        })
      })
    saveQueue.current = request
    try {
      await request
      if (mounted.current && capturedVersion === version.current) setDirty(false)
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause))
      throw cause
    } finally {
      if (mounted.current) setSaving(false)
    }
  }, [repos])
  useEffect(() => {
    if (!dirty || saving || error) return
    const timer = setTimeout(() => {
      void save().catch(() => undefined)
    }, 650)
    return () => clearTimeout(timer)
  }, [dirty, saving, save, visit, error])
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
    const oldIds = taskId
      ? (latest.current.answers.find((answer) => answer.taskId === taskId)?.evidenceIds ?? [])
      : latest.current.evidenceIds
    await repos.evidence.put({ ...photo, taskId })
    if (taskId) patchAnswer(taskId, { evidenceIds: [photo.id] })
    else update({ evidenceIds: [photo.id] })
    await save()
    await Promise.all(oldIds.map((oldId) => repos.evidence.remove(oldId)))
  }
  const remove = (id: string, taskId?: number) => {
    if (taskId) {
      const answer = latest.current.answers.find((item) => item.taskId === taskId)
      patchAnswer(taskId, { evidenceIds: answer?.evidenceIds.filter((item) => item !== id) ?? [] })
    } else update({ evidenceIds: latest.current.evidenceIds.filter((item) => item !== id) })
    void save()
      .then(() => repos.evidence.remove(id))
      .catch(() => undefined)
  }
  const finish = async () => {
    if (step.kind !== 'editing' || saving) return
    const pending = pendingItems(latest.current)
    if (pending.length) {
      setError(pending.join(' '))
      return
    }
    if (
      visit.origin === 'checklist' &&
      visit.expiresAt &&
      Date.now() >= Date.parse(visit.expiresAt)
    ) {
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
      const next = await repos.visits.complete(visit.id, coordinates)
      setVisit(next)
      latest.current = next
      setDirty(false)
      setStep({ kind: 'success', pending: false })
    } catch (cause) {
      if (
        visit.origin === 'checklist' &&
        visit.expiresAt &&
        Date.now() >= Date.parse(visit.expiresAt)
      ) {
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
  const editable = visit.status === 'in_progress'

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
  }
}
