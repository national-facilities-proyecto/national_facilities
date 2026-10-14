import { useEffect, useRef } from 'react'
import { useAuth } from './AuthProvider'

const INACTIVITY_LIMIT_MS = 5 * 60 * 1000
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const

export function useInactivityLogout() {
  const { session, logout } = useAuth()
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!session) return

    const resetTimer = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        void logout()
      }, INACTIVITY_LIMIT_MS)
    }

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer))
    resetTimer()

    return () => {
      if (timer.current) clearTimeout(timer.current)
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer))
    }
  }, [session, logout])
}
