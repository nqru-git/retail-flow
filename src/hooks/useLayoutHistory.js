import { useCallback, useEffect, useRef, useState } from 'react'
import { initialStoreMap } from '../data/initialStoreMap.js'
import { appendLocalLayout, createLocalLayout } from '../lib/layoutHistory.js'
import { layoutRepository, describeLayoutError } from '../lib/layoutRepository.js'
import { supabase, supabaseConfigurationError } from '../lib/supabase.js'

export default function useLayoutHistory() {
  const [initialLayout] = useState(() => createLocalLayout(initialStoreMap))
  const [response, setResponse] = useState(() => ({ attempt: -1, history: supabase ? [] : [initialLayout], error: '' }))
  const [attempt, setAttempt] = useState(0)
  const localHistory = useRef(response.history)
  const isLocal = !supabase
  const refresh = useCallback(() => setAttempt((current) => current + 1), [])

  useEffect(() => {
    if (isLocal) return
    let active = true
    async function load() {
      const history = await layoutRepository.getHistory()
      if (history.length) return history
      await layoutRepository.initialize(initialLayout.id, initialLayout.layoutSnapshot)
      return layoutRepository.getHistory()
    }
    load().then(
      (history) => { if (active) setResponse({ attempt, history, error: '' }) },
      (error) => { if (active) setResponse((previous) => ({ ...previous, attempt, error: describeLayoutError(error) })) },
    )
    return () => { active = false }
  }, [isLocal, attempt, initialLayout])

  async function save(request) {
    let layout
    if (isLocal) {
      localHistory.current = appendLocalLayout(localHistory.current, request, new Date().toISOString())
      layout = localHistory.current.at(-1)
    } else layout = await layoutRepository.save(request)
    setResponse((previous) => {
      const history = previous.history.some((item) => item.id === layout.id) ? previous.history : [...previous.history, layout].sort((a, b) => a.versionNumber - b.versionNumber)
      return { attempt, history, error: '' }
    })
    return layout
  }

  return { history: response.history, currentLayout: response.history.at(-1), loading: !isLocal && response.attempt !== attempt, error: response.error, isLocal, localNotice: isLocal ? `${supabaseConfigurationError} 配置履歴はローカルプレビューで、再読み込みすると消えます。` : '', refresh, save }
}
