import { useEffect } from 'react'

export default function useUnsavedChanges(enabled) {
  useEffect(() => {
    if (!enabled) return
    const warnBeforeLeaving = event => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [enabled])
}
