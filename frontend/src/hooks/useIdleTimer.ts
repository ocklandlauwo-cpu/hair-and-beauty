import { useCallback, useEffect, useRef } from 'react'

const IDLE_EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart'] as const

export function useIdleTimer(
  onWarn: () => void,
  onTimeout: () => void,
  timeoutMs = 30 * 60 * 1000,
  warnAt = 25 * 60 * 1000,
): { reset: () => void } {
  const warnRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const logoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const reset = useCallback(() => {
    clearTimeout(warnRef.current)
    clearTimeout(logoutRef.current)
    warnRef.current = setTimeout(onWarn, warnAt)
    logoutRef.current = setTimeout(onTimeout, timeoutMs)
  }, [onWarn, onTimeout, warnAt, timeoutMs])

  useEffect(() => {
    reset()
    IDLE_EVENTS.forEach(e => document.addEventListener(e, reset, { passive: true }))
    return () => {
      clearTimeout(warnRef.current)
      clearTimeout(logoutRef.current)
      IDLE_EVENTS.forEach(e => document.removeEventListener(e, reset))
    }
  }, [reset])

  return { reset }
}
