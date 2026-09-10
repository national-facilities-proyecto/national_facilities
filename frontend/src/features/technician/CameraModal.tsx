import { useEffect, useRef, useState } from 'react'
import type { Evidence } from '../../types/models'
import { useObjectUrl } from '../../hooks/useObjectUrl'
import { Modal } from '../../components/ui/Modal'
import { Alert, Button } from '../../components/ui'
type Props = {
  open: boolean
  onClose(this: void): void
  onCapture(this: void, photo: Evidence): Promise<void> | void
}
export function CameraModal({ open, onClose, onCapture }: Props) {
  return open ? <CameraSession onClose={onClose} onCapture={onCapture} /> : null
}
function CameraSession({ onClose, onCapture }: Omit<Props, 'open'>) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const active = useRef(true)
  const [attempt, setAttempt] = useState(0)
  const [photo, setPhoto] = useState<Evidence>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const preview = useObjectUrl(photo?.blob)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useEffect(() => {
    let disposed = false
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
        const next = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 } },
          audio: false,
        })
        if (disposed) {
          next.getTracks().forEach((track) => track.stop())
          return
        }
        stream.current = next
        if (video.current) video.current.srcObject = next
      } catch (cause) {
        if (disposed) return
        const name = cause instanceof Error ? cause.name : ''
        setError(
          name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Habilítalo en el navegador.'
            : name === 'NotReadableError'
              ? 'La cámara está ocupada por otra aplicación.'
              : !window.isSecureContext
                ? 'La cámara necesita HTTPS o localhost.'
                : 'No se pudo abrir la cámara. Verifica el dispositivo y los permisos.',
        )
      }
    }
    void start()
    return () => {
      disposed = true
      stream.current?.getTracks().forEach((track) => track.stop())
      stream.current = null
    }
  }, [attempt])
  const capture = () => {
    const element = video.current
    if (busy || !element?.videoWidth) return
    setBusy(true)
    const canvas = document.createElement('canvas')
    const ratio = Math.min(1, 1280 / element.videoWidth)
    canvas.width = Math.round(element.videoWidth * ratio)
    canvas.height = Math.round(element.videoHeight * ratio)
    const context = canvas.getContext('2d')
    if (!context) {
      setError('No se pudo preparar la imagen.')
      setBusy(false)
      return
    }
    context.drawImage(element, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!active.current) return
        setBusy(false)
        if (!blob || blob.size > 5 * 1024 * 1024) {
          setError('La foto debe ocupar menos de 5 MB. Reintenta.')
          return
        }
        const id = crypto.randomUUID()
        setPhoto({
          id,
          blob,
          name: `Evidencia ${new Date().toLocaleTimeString('es-PE')}`,
          mimeType: blob.type,
          size: blob.size,
          capturedAt: new Date().toISOString(),
          source: 'camera',
        })
        stream.current?.getTracks().forEach((track) => track.stop())
      },
      'image/jpeg',
      0.82,
    )
  }
  return (
    <Modal open title="Tomar fotografía" onClose={onClose} busy={busy}>
      {error && <Alert>{error}</Alert>}
      {preview ? (
        <img
          src={preview}
          alt="Previsualización de la evidencia"
          className="nf-camera"
          width="640"
          height="480"
        />
      ) : (
        <video
          ref={video}
          className="nf-camera"
          autoPlay
          muted
          playsInline
          onLoadedMetadata={() => setReady(true)}
        />
      )}
      <div className="nf-actions">
        {photo ? (
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setPhoto(undefined)
                setReady(false)
                setError('')
                setAttempt((value) => value + 1)
              }}
            >
              Repetir
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (busy) return
                setBusy(true)
                void Promise.resolve(onCapture(photo))
                  .then(onClose)
                  .catch(() => setError('No se pudo guardar la foto. Reintenta.'))
                  .finally(() => {
                    if (active.current) setBusy(false)
                  })
              }}
            >
              {busy ? 'Guardando…' : 'Confirmar foto'}
            </Button>
          </>
        ) : error ? (
          <Button
            onClick={() => {
              setError('')
              setReady(false)
              setAttempt((value) => value + 1)
            }}
          >
            Reintentar cámara
          </Button>
        ) : (
          <Button disabled={!ready || busy} onClick={capture}>
            Capturar
          </Button>
        )}
      </div>
    </Modal>
  )
}
