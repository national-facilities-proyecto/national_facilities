import { useEffect, useRef, useState } from 'react'

export function ProfileMenu({ onLogout, name = 'Carlos Mendoza', role = 'Técnico de campo', initials = 'CM' }: { onLogout: () => void; name?: string; role?: string; initials?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false) }; const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }; document.addEventListener('mousedown', close); document.addEventListener('keydown', esc); return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) } }, [])
  return <div className="profile" ref={ref}><button className="profile__trigger" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><span className="profile__avatar">{initials}</span><span className="profile__identity"><strong>{name}</strong><small>{role}</small></span></button>{open && <div className="profile__menu" role="menu"><div className="profile__summary"><strong>{name}</strong><span>{role}</span></div><button role="menuitem" type="button">Cambiar contraseña</button><button role="menuitem" type="button" onClick={onLogout}>Cerrar sesión</button></div>}</div>
}
