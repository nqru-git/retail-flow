import { useEffect, useRef, useState } from 'react'
import HomePage from './pages/HomePage.jsx'
import StoreMapEditorPage from './pages/StoreMapEditorPage.jsx'
import ObservationPage from './pages/ObservationPage.jsx'
import { homePreview } from './data/homePreview.js'
import { initialStoreMap } from './data/initialStoreMap.js'
import { cloneMapElements } from './lib/storeMap.js'
import { createObservationState, observationDate, summarizeObservations } from './lib/observation.js'
import './App.css'

const upcomingFeatureMessages = {
  analysis: '分析機能は準備中です。',
  history: '配置履歴は準備中です。',
}

function App() {
  const [notice, setNotice] = useState('')
  const [screen, setScreen] = useState('home')
  const [savedMap, setSavedMap] = useState(() => cloneMapElements(initialStoreMap))
  const [activeObservation, setActiveObservation] = useState(null)
  const [observations, setObservations] = useState([])
  const [todayDate, setTodayDate] = useState(() => observationDate(new Date().toISOString()))
  const nextObservationNumber = useRef(homePreview.today.observedCount + 1)

  useEffect(() => {
    const timer = window.setInterval(() => setTodayDate(observationDate(new Date().toISOString())), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    document.title = { map: 'Retail Flow | 店舗マップ編集', observation: 'Retail Flow | 顧客観察', home: 'Retail Flow | ホーム' }[screen]
    window.scrollTo(0, 0)
  }, [screen])

  function handleAction(action) {
    if (action === 'observation') {
      setActiveObservation(createObservationState({ number: nextObservationNumber.current++, layoutVersion: homePreview.layoutVersion, elements: savedMap, startedAt: new Date().toISOString() }))
      setNotice('')
      setScreen('observation')
      return
    }
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

  function completeObservation(record) {
    setObservations((current) => current.some((existing) => existing.id === record.id) ? current : [...current, record])
    setActiveObservation(null)
    setTodayDate(observationDate(new Date().toISOString()))
    setNotice(`観察 #${String(record.number).padStart(3, '0')} を記録しました（${record.result === 'purchase' ? '購入' : '非購入'}）。`)
    setScreen('home')
  }

  function discardObservation() {
    setActiveObservation(null)
    setNotice('観察を破棄しました。')
    setScreen('home')
  }

  if (screen === 'observation' && activeObservation) {
    return <ObservationPage key={activeObservation.observation.id} initialState={activeObservation} onComplete={completeObservation} onDiscard={discardObservation} />
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

  const recordedToday = summarizeObservations(observations, todayDate)
  const homeData = {
    ...homePreview,
    today: {
      observedCount: homePreview.today.observedCount + recordedToday.observedCount,
      purchasedCount: homePreview.today.purchasedCount + recordedToday.purchasedCount,
      recordedCount: recordedToday.observedCount,
    },
  }
  return <HomePage data={homeData} onAction={handleAction} notice={notice} />
}

export default App
