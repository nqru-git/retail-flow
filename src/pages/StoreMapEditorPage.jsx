import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import StoreMapCanvas from '../components/store-map/StoreMapCanvas.jsx'
import MapElementPalette from '../components/store-map/MapElementPalette.jsx'
import MapElementProperties from '../components/store-map/MapElementProperties.jsx'
import MapElementList from '../components/store-map/MapElementList.jsx'
import { cloneMapElements, createMapElement } from '../lib/storeMap.js'
import { fitMapElementSize } from '../lib/mapElementSizing.js'
import { createLayoutId, layoutLabel } from '../lib/layoutHistory.js'
import { describeLayoutError } from '../lib/layoutRepository.js'
import useUnsavedChanges from '../hooks/useUnsavedChanges.js'
import './StoreMapEditor.css'

export default function StoreMapEditorPage({ storeName, baseLayout, initialElements, isLocal, onSave, onBack, draft, onDraftChange }) {
  const [elements, setElements] = useState(() => cloneMapElements(draft?.elements ?? initialElements))
  const [selectedId, setSelectedId] = useState(draft?.selectedId ?? null)
  const [notice, setNotice] = useState('')
  const [nameErrorId, setNameErrorId] = useState(null)
  const [changeNote, setChangeNote] = useState(draft?.changeNote ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [minimumSizes, setMinimumSizes] = useState({})
  const inFlight = useRef(false)
  const saveRequest = useRef(draft?.saveRequest ?? null)
  const headingRef = useRef(null)
  const boardRef = useRef(null)
  const selectedElement = elements.find((element) => element.id === selectedId)
  const hasChanges = JSON.stringify(elements) !== JSON.stringify(initialElements) || changeNote.length > 0
  useUnsavedChanges(hasChanges || saving)

  useEffect(() => { headingRef.current?.focus() }, [])
  useEffect(() => { onDraftChange?.({ elements, selectedId, changeNote, saveRequest: saveRequest.current }) }, [elements, selectedId, changeNote, saving, onDraftChange])

  function addElement(type) {
    const element = createMapElement(type, elements)
    setElements((current) => [...current, element])
    setSelectedId(element.id)
    setNameErrorId(null)
    setNotice(`${element.name}を追加しました。`)
  }

  const updateElement = useCallback((id, changes) => {
    setElements((current) => current.map((element) => element.id === id ? { ...element, ...changes } : element))
    setNameErrorId(null)
    setNotice('')
  }, [])

  function updateProperties(changes) {
    if (!selectedElement) return
    const updated = { ...selectedElement, ...changes }
    const resized = fitMapElementSize(boardRef.current, updated, updated, { axis: changes.height !== undefined ? 'height' : changes.width !== undefined ? 'width' : 'both', allowReposition: changes.width === undefined && changes.height === undefined })
    updateElement(selectedId, resized)
  }

  function deleteElement() {
    setElements((current) => current.filter((element) => element.id !== selectedId))
    setNotice(`${selectedElement.name || '選択したもの'}を削除しました。`)
    setSelectedId(null)
    setNameErrorId(null)
  }

  async function saveMap() {
    if (inFlight.current) return
    const unnamed = elements.find((element) => !element.name.trim())
    if (unnamed) {
      setSelectedId(unnamed.id)
      setNameErrorId(unnamed.id)
      setNotice('名前が未入力のものがあります。名前を入力してから保存してください。')
      return
    }
    const payload = { baseId: baseLayout.id, layoutSnapshot: elements.map((element) => ({ ...element, name: element.name.trim() })), changeNote: changeNote.trim() }
    const signature = JSON.stringify(payload)
    if (saveRequest.current?.signature !== signature) saveRequest.current = { signature, request: { ...payload, id: createLayoutId() } }
    inFlight.current = true
    setSaving(true)
    setSaveError('')
    try { await onSave(saveRequest.current.request) }
    catch (error) { setSaveError(describeLayoutError(error)) }
    finally { inFlight.current = false; setSaving(false) }
  }

  function goBack() {
    if (hasChanges && !window.confirm('保存していない変更を破棄して、ホームに戻りますか？')) return
    onBack()
  }

  return (
    <div className="app-shell app-shell--editor">
      <header className="editor-topbar">
        <button className="editor-back-button" type="button" onClick={goBack} disabled={saving}><Icon name="back" />ホームへ</button>
        <span>{storeName}</span>
      </header>
      <main className="map-editor" aria-busy={saving}>
        <div className="editor-heading">
          <p className="eyebrow">配置 {layoutLabel(baseLayout)} のコピーを編集</p>
          <h1 ref={headingRef} tabIndex={-1}>店舗マップを編集</h1>
          <p>タップして編集、ドラッグで移動。<br />緑のハンドルでサイズを変更できます。</p>
        </div>
        <fieldset className="editor-fields" disabled={saving} inert={saving}>
        <div className="editor-workspace">
          <div>
            <section aria-labelledby="map-heading">
              <div className="section-heading"><h2 id="map-heading">店舗マップ</h2><span className="status-badge">{hasChanges ? '未保存の変更あり' : '現在の配置'}</span></div>
              <StoreMapCanvas elements={elements} selectedId={selectedId} onSelect={setSelectedId} onChange={updateElement} boardRef={boardRef} minimumSizes={minimumSizes} onMinimumSizesChange={setMinimumSizes} />
              <p className="map-caption">空白は通路として扱います。</p>
            </section>
            <MapElementPalette onAdd={addElement} />
          </div>
          <div className="editor-sidebar">
            <MapElementProperties element={selectedElement} minimumSize={minimumSizes[selectedId]} onChange={updateProperties} onDelete={deleteElement} showNameError={Boolean(selectedElement && nameErrorId === selectedId)} />
            <MapElementList elements={elements} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </div>
        <section className="layout-change-note">
          <label className="map-field" htmlFor="change-note">変更理由 <span className="map-field__required">任意</span>
            <textarea id="change-note" name="change-note" value={changeNote} onChange={(event) => setChangeNote(event.target.value)} maxLength={1200} rows={4} placeholder="例：新作バッグを入口横に移動。新商品の露出を増やし、立ち寄りが変わるか確認するため。" />
          </label>
          <p>入力した変更理由を、新しい配置バージョンと一緒に履歴へ保存します。</p>
          <p>空欄でも保存できます。履歴には「変更理由の記入はありません。」と表示します。</p>
        </section>
        </fieldset>
        {saveError && <p className="editor-save-error" role="alert">{saveError}<br />編集内容と変更理由はこの画面に保持されています。</p>}
        <p className="editor-notice" role="status" aria-atomic="true">{notice}</p>
      </main>
      <div className="editor-save-bar">
        <button className="editor-save-button" type="button" onClick={saveMap} disabled={saving}><Icon name="check" />{saving ? '配置を保存中…' : saveError ? '保存を再試行' : '新しい配置として保存'}</button>
        <p role="status">{saving ? '保存しています。完了するとホームへ戻ります。' : isLocal ? 'ローカルプレビューです。再読み込みすると履歴は消えます。' : `配置 ${layoutLabel(baseLayout)} を残して、新しいバージョンを保存します。`}</p>
      </div>
    </div>
  )
}
