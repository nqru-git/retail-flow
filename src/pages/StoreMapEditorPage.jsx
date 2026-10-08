import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import StoreMapCanvas from '../components/store-map/StoreMapCanvas.jsx'
import MapElementPalette from '../components/store-map/MapElementPalette.jsx'
import MapElementProperties from '../components/store-map/MapElementProperties.jsx'
import MapElementList from '../components/store-map/MapElementList.jsx'
import { cloneMapElements, createMapElement, resizeMapElement } from '../lib/storeMap.js'
import './StoreMapEditor.css'

export default function StoreMapEditorPage({ storeName, initialElements, onSave, onBack }) {
  const [elements, setElements] = useState(() => cloneMapElements(initialElements))
  const [selectedId, setSelectedId] = useState(null)
  const [notice, setNotice] = useState('')
  const [nameErrorId, setNameErrorId] = useState(null)
  const headingRef = useRef(null)
  const selectedElement = elements.find((element) => element.id === selectedId)
  const hasChanges = JSON.stringify(elements) !== JSON.stringify(initialElements)

  useEffect(() => { headingRef.current?.focus() }, [])

  function addElement(type) {
    const element = createMapElement(type, elements)
    setElements((current) => [...current, element])
    setSelectedId(element.id)
    setNameErrorId(null)
    setNotice(`${element.name}を追加しました。`)
  }

  function updateElement(id, changes) {
    setElements((current) => current.map((element) => element.id === id ? { ...element, ...changes } : element))
    setNameErrorId(null)
    setNotice('')
  }

  function updateProperties(changes) {
    if (!selectedElement) return
    const resized = resizeMapElement(
      selectedElement,
      changes.width === undefined ? 0 : changes.width - selectedElement.width,
      changes.height === undefined ? 0 : changes.height - selectedElement.height,
    )
    updateElement(selectedId, { ...changes, width: resized.width, height: resized.height })
  }

  function deleteElement() {
    setElements((current) => current.filter((element) => element.id !== selectedId))
    setNotice(`${selectedElement.name || '選択したもの'}を削除しました。`)
    setSelectedId(null)
    setNameErrorId(null)
  }

  function saveMap() {
    const unnamed = elements.find((element) => !element.name.trim())
    if (unnamed) {
      setSelectedId(unnamed.id)
      setNameErrorId(unnamed.id)
      setNotice('名前が未入力のものがあります。名前を入力してから保存してください。')
      return
    }
    onSave(elements.map((element) => ({ ...element, name: element.name.trim() })))
  }

  function goBack() {
    if (hasChanges && !window.confirm('保存していない変更を破棄して、ホームに戻りますか？')) return
    onBack()
  }

  return (
    <div className="app-shell app-shell--editor">
      <header className="editor-topbar">
        <button className="editor-back-button" type="button" onClick={goBack}><Icon name="back" />ホームへ</button>
        <span>{storeName}</span>
      </header>
      <main className="map-editor">
        <div className="editor-heading">
          <p className="eyebrow">配置を変更</p>
          <h1 ref={headingRef} tabIndex={-1}>店舗マップを編集</h1>
          <p>タップして編集、ドラッグで移動。<br />選択したものの右下でサイズを変更できます。</p>
        </div>
        <div className="editor-workspace">
          <div>
            <section aria-labelledby="map-heading">
              <div className="section-heading"><h2 id="map-heading">店舗マップ</h2><span className="sample-badge">{hasChanges ? '未保存の変更あり' : '現在の配置'}</span></div>
              <StoreMapCanvas elements={elements} selectedId={selectedId} onSelect={setSelectedId} onChange={updateElement} />
              <p className="map-caption">空白は通路として扱います。</p>
            </section>
            <MapElementPalette onAdd={addElement} />
          </div>
          <div className="editor-sidebar">
            <MapElementProperties element={selectedElement} onChange={updateProperties} onDelete={deleteElement} showNameError={Boolean(selectedElement && nameErrorId === selectedId)} />
            <MapElementList elements={elements} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </div>
        <p className="editor-notice" role="status" aria-atomic="true">{notice}</p>
      </main>
      <div className="editor-save-bar">
        <button className="editor-save-button" type="button" onClick={saveMap}><Icon name="check" />マップを保存</button>
        <p>保存内容は再読み込みするとリセットされます。</p>
      </div>
    </div>
  )
}
