import { useCallback, useEffect, useRef, useState } from 'react'
import { observationRepository, describeSupabaseError } from '../../lib/observationRepository.js'

export default function ObservationSaveStatus({ record, onSaved }) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(true)
  const inFlight = useRef(false)

  const save = useCallback(() => {
    if (inFlight.current) return
    inFlight.current = true
    observationRepository.save(record).then(
      () => { inFlight.current = false; onSaved(record) },
      (failure) => {
        inFlight.current = false
        setError(describeSupabaseError(failure))
        setSaving(false)
      },
    )
  }, [record, onSaved])

  useEffect(() => { void save() }, [save])
  useEffect(() => {
    document.querySelector('.observation-save-status h1')?.focus()
  }, [])

  function retry() {
    if (inFlight.current) return
    setSaving(true)
    setError('')
    void save()
  }

  return (
    <main className="observation-save-status" aria-busy={saving}>
      <p className="eyebrow">観察 #{String(record.number).padStart(3, '0')}</p>
      <h1 tabIndex={-1}>{saving ? '観察を保存中…' : '保存できませんでした'}</h1>
      <p className="observation-save-status__result">{record.result === 'purchase' ? '購入' : '非購入'} · ルート {record.routeSteps.length}か所</p>
      {saving ? (
        <p role="status">保存が完了するとホームへ戻ります。</p>
      ) : (
        <>
          <p className="observation-save-status__error" role="alert">{error}</p>
          <p>観察データはこの画面に保持されています。再読み込みや画面を閉じる操作はせず、再試行してください。</p>
          <button className="observation-save-status__retry" type="button" onClick={retry}>保存を再試行</button>
        </>
      )}
    </main>
  )
}
