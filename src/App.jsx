import { useEffect, useState } from 'react'
import HomePage from './pages/HomePage.jsx'
import StoreMapEditorPage from './pages/StoreMapEditorPage.jsx'
import { homePreview } from './data/homePreview.js'
import { initialStoreMap } from './data/initialStoreMap.js'
import { cloneMapElements } from './lib/storeMap.js'
import './App.css'

const upcomingFeatureMessages = {
  observation: '観察機能は準備中です。',
  analysis: '分析機能は準備中です。',
  history: '配置履歴は準備中です。',
}

function App() {
  const [notice, setNotice] = useState('')
  const [screen, setScreen] = useState('home')
  const [savedMap, setSavedMap] = useState(() => cloneMapElements(initialStoreMap))

  useEffect(() => {
    document.title = screen === 'map' ? 'Retail Flow | 店舗マップ編集' : 'Retail Flow | ホーム'
    window.scrollTo(0, 0)
  }, [screen])

  function handleAction(action) {
    if (action === 'layout') {
      setNotice('')
      setScreen('map')
      return
    }
    setNotice(upcomingFeatureMessages[action])
  }

  function handleSave(elements) {
    setSavedMap(cloneMapElements(elements))
    setNotice('店舗マップを保存しました。')
    setScreen('home')
  }

  if (screen === 'map') {
    return (
      <StoreMapEditorPage
        storeName={homePreview.storeName}
        initialElements={savedMap}
        onSave={handleSave}
        onBack={() => setScreen('home')}
      />
    )
  }

  return <HomePage data={homePreview} onAction={handleAction} notice={notice} />
}

export default App
