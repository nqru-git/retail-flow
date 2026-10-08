import { useState } from 'react'
import HomePage from './pages/HomePage.jsx'
import { homePreview } from './data/homePreview.js'
import './App.css'

const upcomingFeatureMessages = {
  observation: '観察機能は準備中です。',
  layout: '配置の変更機能は準備中です。',
  analysis: '分析機能は準備中です。',
  history: '配置履歴は準備中です。',
}

function App() {
  const [notice, setNotice] = useState('')

  function handleAction(action) {
    setNotice(upcomingFeatureMessages[action])
  }

  return <HomePage data={homePreview} onAction={handleAction} notice={notice} />
}

export default App
