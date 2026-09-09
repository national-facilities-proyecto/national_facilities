import { useEffect, useRef, useState } from 'react'

type Props = { open: boolean; onClose: () => void; onCapture: (photo: string) => void }

export function CameraModal({ open, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [cameraSession, setCameraSession] = useState(0)

  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    let disposed = false
    queueMicrotask(() => {
      if (disposed) return
      setError('')
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
    })
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        queueMicrotask(() => setError('La cámara en tiempo real no está disponible en este navegador.'))
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 } }, audio: false })
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch {
        setError('No se pudo abrir la cámara. Revisa el permiso y usa HTTPS o localhost.')
      }
    }
    void start()
    return () => {
      disposed = true
      stop()
    }
  }, [open, cameraSession])

  if (!open) return null

  const capture = () => {
    const video = videoRef.current
    if (!video?.videoWidth) return
    const canvas = document.createElement('canvas')
    const max = 1280
    const scale = Math.min(1, max / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob || blob.size > 5_000_000) {
        setError('La foto no cumple el límite de tamaño.')
        return
      }
      setPreview(URL.createObjectURL(blob))
      stop()
    }, 'image/jpeg', .82)
  }

  const cancel = () => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setError('')
    onClose()
  }

  const repeat = () => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setError('')
    setCameraSession((session) => session + 1)
  }

  return <div className="modal-backdrop" role="presentation"><section className="modal camera-modal" role="dialog" aria-modal="true" aria-labelledby="camera-title"><div className="modal__header"><div><span className="eyebrow">Evidencia en tiempo real</span><h2 id="camera-title">Tomar fotografía</h2></div><button ref={closeRef} className="icon-button" type="button" aria-label="Cerrar cámara" onClick={cancel}>×</button></div>{error ? <div className="notice notice--error" role="alert">{error}</div> : preview ? <img className="camera-modal__video" src={preview} alt="Previsualización de la evidencia" /> : <video className="camera-modal__video" ref={videoRef} autoPlay muted playsInline /> }<div className="modal__actions">{preview ? <><button className="action-button action-button--ghost" type="button" onClick={repeat}>Repetir</button><button className="action-button action-button--primary" type="button" onClick={() => { setPreview(null); onCapture(preview); onClose() }}>Confirmar foto</button></> : <><button className="action-button action-button--ghost" type="button" onClick={cancel}>Cancelar</button><button className="action-button action-button--primary" type="button" disabled={Boolean(error)} onClick={capture}>Capturar</button></>}</div></section></div>
}
