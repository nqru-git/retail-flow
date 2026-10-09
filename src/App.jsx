import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import HomePage from './pages/HomePage.jsx'
import StoreMapEditorPage from './pages/StoreMapEditorPage.jsx'
import ObservationPage from './pages/ObservationPage.jsx'
import LayoutHistoryPage from './pages/LayoutHistoryPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import useAuth from './hooks/useAuth.js'
import { authRepository, describeAuthError } from './lib/authRepository.js'
import { cloneMapElements } from './lib/storeMap.js'
import { layoutLabel } from './lib/layoutHistory.js'
import { createObservationState, observationDate } from './lib/observation.js'
import useTodaySummary from './hooks/useTodaySummary.js'
import useLayoutHistory from './hooks/useLayoutHistory.js'
import useUnsavedChanges from './hooks/useUnsavedChanges.js'
import './App.css'

const AnalysisPage = lazy(() => import('./pages/AnalysisPage.jsx'))

function RetailApp({ identity, draft, onDraftChange, onLogout }) {
  const storeName = identity.storeName
  const [loggingOut, setLoggingOut] = useState(false)
  const [notice, setNotice] = useState('')
  const [screen, setScreen] = useState(draft?.screen ?? 'home')
  const [editingLayout, setEditingLayout] = useState(draft?.editingLayout ?? null)
  const [editorDraft, setEditorDraft] = useState(draft?.editorDraft ?? null)
  const [activeObservation, setActiveObservation] = useState(draft?.activeObservation ?? null)
  const [summaryVersion, setSummaryVersion] = useState(0)
  const [todayDate, setTodayDate] = useState(() => observationDate(new Date().toISOString()))
  const nextObservationNumber = useRef(1)
  const { summary, retry: retrySummary } = useTodaySummary(todayDate, summaryVersion)
  const layouts = useLayoutHistory()
  const refreshLayouts = layouts.refresh
  useEffect(() => { onDraftChange({ screen, editingLayout, editorDraft, activeObservation }) }, [screen, editingLayout, editorDraft, activeObservation, onDraftChange])

  useEffect(() => {
    const timer = window.setInterval(() => setTodayDate(observationDate(new Date().toISOString())), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    document.title = { map: 'Retail Flow | 店舗マップ編集', observation: 'Retail Flow | 顧客観察', history: 'Retail Flow | 配置履歴', analysis: 'Retail Flow | 分析', home: 'Retail Flow | ホーム' }[screen]
    window.scrollTo(0, 0)
  }, [screen])

  function handleAction(action) {
    if (action === 'observation') {
      if (!layouts.currentLayout || layouts.loading) return
      setActiveObservation(createObservationState({ number: nextObservationNumber.current++, storeId: identity.storeId, layoutVersion: layoutLabel(layouts.currentLayout), layoutVersionId: layouts.isLocal ? null : layouts.currentLayout.id, elements: layouts.currentLayout.layoutSnapshot, startedAt: new Date().toISOString() }))
      setNotice('')
      setScreen('observation')
      return
    }
    if (action === 'layout') {
      if (!layouts.currentLayout || layouts.loading) return
      setEditingLayout({ ...layouts.currentLayout, layoutSnapshot: cloneMapElements(layouts.currentLayout.layoutSnapshot) })
      setEditorDraft(null)
      setNotice('')
      setScreen('map')
      return
    }
    if (action === 'history' || action === 'analysis') {
      layouts.refresh()
      setNotice('')
      setScreen(action)
      return
    }
  }

  async function handleSave(request) {
    const layout = await layouts.save(request)
    setEditingLayout(null)
    setNotice(`配置 ${layoutLabel(layout)} を${layouts.isLocal ? 'ローカルに' : ''}保存しました。`)
    setScreen('home')
    layouts.refresh()
  }

  function goHome() {
    setScreen('home')
    layouts.refresh()
  }

  const completeObservation = useCallback((record) => {
    setActiveObservation(null)
    setTodayDate(observationDate(new Date().toISOString()))
    setSummaryVersion((current) => current + 1)
    setNotice(`観察 #${String(record.number).padStart(3, '0')} を保存しました（${record.result === 'purchase' ? '購入' : '非購入'}）。`)
    setScreen('home')
    refreshLayouts()
  }, [refreshLayouts])

  function discardObservation() {
    setActiveObservation(null)
    setNotice('観察を破棄しました。')
    setScreen('home')
    layouts.refresh()
  }

  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)
    try { await authRepository.signOut(); onLogout() } catch (error) { setNotice(describeAuthError(error)); setLoggingOut(false) }
  }

  if (screen === 'observation' && activeObservation) {
    return <ObservationPage key={activeObservation.observation.id} initialState={activeObservation} onComplete={completeObservation} onDiscard={discardObservation} onDraftChange={setActiveObservation} />
  }

  if (screen === 'history') {
    return <LayoutHistoryPage layouts={layouts} onBack={goHome} />
  }

  if (screen === 'analysis') {
    return <Suspense fallback={<div className="app-shell"><p role="status">分析画面を読み込んでいます…</p></div>}><AnalysisPage layouts={layouts} onBack={goHome} /></Suspense>
  }

  if (screen === 'map' && editingLayout) {
    return (
      <StoreMapEditorPage
        storeName={storeName}
        key={editingLayout.id}
        baseLayout={editingLayout}
        initialElements={editingLayout.layoutSnapshot}
        isLocal={layouts.isLocal}
        onSave={handleSave}
        onBack={goHome}
        draft={editorDraft}
        onDraftChange={setEditorDraft}
      />
    )
  }

  const homeData = {
    storeName,
    layoutVersion: layoutLabel(layouts.currentLayout),
    today: summary,
  }
  return <HomePage data={homeData} onAction={handleAction} notice={notice} onRetrySummary={retrySummary} layoutState={layouts} onLogout={logout} loggingOut={loggingOut} />
}

function App() {
  const auth = useAuth()
  const [drafts, setDrafts] = useState(null)
  const accountKey = auth.identity ? `${auth.identity.userId}:${auth.identity.storeId}` : null
  const rememberDraft = useCallback(draft => { setDrafts({ accountKey, draft }) }, [accountKey])
  const clearDraft = useCallback(() => { setDrafts(null) }, [])
  const pausedDraft = auth.status !== 'ready' ? drafts?.draft : null
  useUnsavedChanges(pausedDraft?.screen === 'observation' || (pausedDraft?.screen === 'map' && Boolean(pausedDraft.editorDraft?.changeNote || (pausedDraft.editorDraft && JSON.stringify(pausedDraft.editorDraft.elements) !== JSON.stringify(pausedDraft.editingLayout.layoutSnapshot)))))
  if (auth.status !== 'ready') return <LoginPage status={auth.status} error={auth.error} onRetry={auth.retry} onLogout={clearDraft} />
  // Discard the previous account's component state and in-flight views on logout/store change.
  return <RetailApp key={accountKey} identity={auth.identity} draft={drafts?.accountKey === accountKey ? drafts.draft : null} onDraftChange={rememberDraft} onLogout={clearDraft} />
}

export default App
