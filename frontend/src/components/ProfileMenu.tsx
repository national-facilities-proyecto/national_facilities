import { useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { roleLabels } from '../types/models'
import { Button } from './ui'
export function ProfileMenu() {
  const { session, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  if (!session) return null
  const { user } = session
  const initials = user.name
    .split(' ')
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
  return (
    <div
      className="nf-profile"
      ref={ref}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="nf-profile__trigger"
        aria-expanded={open}
        aria-label={`Perfil de ${user.name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="nf-avatar">{initials}</span>
        <span className="hidden md:block">
          <strong>{user.name}</strong>
          <small>{roleLabels[user.role]}</small>
        </span>
      </button>
      {open && (
        <div className="nf-profile__panel">
          <strong>{user.name}</strong>
          <p>{roleLabels[user.role]}</p>
          <Link className="nf-link" to="/profile/password" onClick={() => setOpen(false)}>
            Cambiar contraseña
          </Link>
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(false)
              void logout()
            }}
          >
            Cerrar sesión
          </Button>
        </div>
      )}
    </div>
  )
}
