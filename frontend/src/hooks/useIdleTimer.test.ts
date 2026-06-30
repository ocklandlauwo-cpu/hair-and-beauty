import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useIdleTimer } from './useIdleTimer'

describe('useIdleTimer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('calls onWarn at warnAt and onTimeout at timeoutMs', () => {
    const onWarn = vi.fn()
    const onTimeout = vi.fn()
    renderHook(() => useIdleTimer(onWarn, onTimeout, 300, 200))

    act(() => { vi.advanceTimersByTime(200) })
    expect(onWarn).toHaveBeenCalledOnce()
    expect(onTimeout).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(100) })
    expect(onTimeout).toHaveBeenCalledOnce()
  })

  it('reset() restarts both timers', () => {
    const onWarn = vi.fn()
    const onTimeout = vi.fn()
    const { result } = renderHook(() => useIdleTimer(onWarn, onTimeout, 300, 200))

    act(() => { vi.advanceTimersByTime(150) })
    act(() => { result.current.reset() })
    act(() => { vi.advanceTimersByTime(150) })

    expect(onWarn).not.toHaveBeenCalled()
    expect(onTimeout).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(200) })
    expect(onWarn).toHaveBeenCalledOnce()
  })

  it('cleans up timers and event listeners on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const onWarn = vi.fn()
    const onTimeout = vi.fn()
    const { unmount } = renderHook(() => useIdleTimer(onWarn, onTimeout, 300, 200))

    unmount()

    act(() => { vi.advanceTimersByTime(300) })
    expect(onWarn).not.toHaveBeenCalled()
    expect(onTimeout).not.toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalled()
  })
})
