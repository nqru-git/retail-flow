import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import LayoutChangeReason from '../components/layout-history/LayoutChanges.jsx'
import LayoutStatus from '../components/layout-history/LayoutStatus.jsx'
import MetricComparison from '../components/analysis/MetricComparison.jsx'
import ProductFunnel from '../components/analysis/ProductFunnel.jsx'
import PassageMap from '../components/analysis/PassageMap.jsx'
import useLayoutAnalysis from '../hooks/useLayoutAnalysis.js'
import { layoutLabel } from '../lib/layoutHistory.js'
import { analysisWarnings, comparisonChangeNote, comparisonZones, layoutMetrics, resolveAnalysisComparison, resolveAnalysisZone, selectAnalysisLayout } from '../lib/analysis.js'
import './LayoutHistory.css'
import './Analysis.css'

const zoneMetricLabels = [['passed', 'ゾーン通過率'], ['stopped', '立ち止まり率'], ['touched', '商品接触率'], ['checked', '値札確認率'], ['tried', '試着率'], ['zoneService', '接客率'], ['zonePurchase', '購入率']]

export default function AnalysisPage({ layouts, onBack }) {
  const headingRef = useRef(null)
  const [selection, setSelection] = useState({ beforeId: '', afterId: '' })
  const [selectedZoneId, setSelectedZoneId] = useState('')
  const history = layouts.history
  const { before, after } = resolveAnalysisComparison(history, selection)
  const validPair = Boolean(before && after && before.id !== after.id)
  const zones = validPair ? comparisonZones(before, after) : []
  const zoneId = validPair ? resolveAnalysisZone(before, after, selectedZoneId) : ''
  const zone = zones.find(item => item.id === zoneId)
  const analysis = useLayoutAnalysis(validPair ? before.id : '', validPair ? after.id : '')
  const beforeAggregate = analysis.data?.layouts.find(layout => layout.layoutId === before?.id)
  const afterAggregate = analysis.data?.layouts.find(layout => layout.layoutId === after?.id)
  const ready = Boolean(validPair && beforeAggregate && afterAggregate && !layouts.loading && !layouts.error)
  const first = ready ? layoutMetrics(beforeAggregate, zoneId) : null
  const second = ready ? layoutMetrics(afterAggregate, zoneId) : null
  const firstLabel = layoutLabel(before)
  const secondLabel = layoutLabel(after)
  const reasons = comparisonChangeNote(history, before, after)

  useEffect(() => { headingRef.current?.focus() }, [])

  function changeLayout(side, id) {
    setSelection(selectAnalysisLayout(history, { beforeId: before?.id ?? '', afterId: after?.id ?? '' }, side, id))
  }
  function changeZone(id) {
    if (zones.some(item => item.id === id)) setSelectedZoneId(id)
  }
  function retry() { analysis.retry(); layouts.refresh() }
  const comparisonProps = { beforeLabel: firstLabel, afterLabel: secondLabel }

  return (
    <div className="app-shell app-shell--analysis">
      <header className="history-topbar"><button className="editor-back-button" type="button" onClick={onBack}><Icon name="back" />ホームへ</button><button className="history-refresh" type="button" onClick={retry} disabled={analysis.loading || layouts.loading}>データを再取得</button></header>
      <main>
        <div className="history-heading"><p className="eyebrow">配置の変化を比較</p><h1 ref={headingRef} tabIndex={-1}>分析</h1></div>
        <LayoutStatus loading={layouts.loading} error={layouts.error} localNotice={layouts.localNotice} onRetry={layouts.refresh} />

        <section className="analysis-selectors" aria-label="比較条件">
          <div className="analysis-version-selectors">
            <label htmlFor="analysis-before">比較元<select id="analysis-before" value={before?.id ?? ''} disabled={history.length < 2} onChange={event => changeLayout('beforeId', event.target.value)}>
              {!before && <option value="">配置がありません</option>}
              {history.map(layout => <option key={layout.id} value={layout.id} disabled={layout.id === after?.id}>配置 {layoutLabel(layout)}</option>)}
            </select></label>
            <span aria-hidden="true">VS</span>
            <label htmlFor="analysis-after">比較先<select id="analysis-after" value={after?.id ?? ''} disabled={history.length < 2} onChange={event => changeLayout('afterId', event.target.value)}>
              {!after && <option value="">別の配置が必要です</option>}
              {history.map(layout => <option key={layout.id} value={layout.id} disabled={layout.id === before?.id}>配置 {layoutLabel(layout)}</option>)}
            </select></label>
          </div>
          {zones.length > 0 && <label htmlFor="analysis-zone">比較する売場ゾーン<select id="analysis-zone" value={zoneId} onChange={event => changeZone(event.currentTarget.value)}>{zones.map(item => <option key={item.id} value={item.id}>{item.name}{item.product && ` · ${item.product}`}</option>)}</select></label>}
          <p className="analysis-note">配置履歴の全バージョンから選べます。同じ配置同士は比較できません。各配置の保存済み観察すべてを比較します。</p>
        </section>

        {ready && <div className="analysis-no-data" role="status">
          {[{ layout: before, aggregate: beforeAggregate }, { layout: after, aggregate: afterAggregate }].filter(item => item.aggregate.observedCount === 0).map(item => <p key={item.layout.id}><strong>配置 {layoutLabel(item.layout)}</strong><span>この配置にはまだ観察データがありません</span></p>)}
        </div>}

        {ready && <section className="analysis-highlight" aria-label="主要結果">
          <p className="analysis-highlight__versions">配置 {firstLabel} → {secondLabel}</p>
          <p className="analysis-highlight__target">比較対象</p>
          <h2>{zone?.name ?? '配置全体'}</h2>
          <p className="analysis-highlight__reason"><strong>変更理由</strong>{reasons}</p>
          <div className="analysis-metrics-grid">
            {zone && <MetricComparison label={`${zone.name}の立ち止まり率`} before={first.stopped} after={second.stopped} {...comparisonProps} />}
            <MetricComparison label={zone ? `${zone.name}の購入率` : '購入率（配置全体）'} before={zone ? first.zonePurchase : first.purchase} after={zone ? second.zonePurchase : second.purchase} {...comparisonProps} />
          </div>
          <p className="analysis-note">記録された変化を表示しています。配置が原因とは断定できません。</p>
        </section>}

        {!layouts.loading && !layouts.error && !validPair && <section className="analysis-empty"><h2>比較する配置がまだありません</h2><p>配置を変更して2つ以上のバージョンを保存すると、前後の比較ができます。</p></section>}
        {analysis.loading && validPair && <p className="summary-message" role="status">分析データを集計しています…</p>}
        {analysis.error && <div className="analysis-error" role="alert"><p>{analysis.error}</p>{!layouts.isLocal && <button className="history-refresh" type="button" onClick={retry}>分析を再取得</button>}</div>}

        {ready && <>
          <div className="analysis-cautions" aria-label="比較時の注意">
            {analysisWarnings(beforeAggregate, afterAggregate).map(message => <p key={message}>{message}</p>)}
            {(beforeAggregate.observedCount === 0 || afterAggregate.observedCount === 0) && <p>観察が0人の配置は、割合と変化量を算出できません。</p>}
            {analysis.data.unlinkedCount > 0 && <p>配置履歴IDのない旧観察 {analysis.data.unlinkedCount}人は、この比較に含めていません。</p>}
          </div>
          <section className="analysis-section" aria-labelledby="analysis-changes-title"><h2 id="analysis-changes-title">比較対象</h2><p className="analysis-selected-zone">{zone?.name ?? '売場ゾーンがありません'}</p><LayoutChangeReason changeNote={reasons} /></section>
          <section className="analysis-section" aria-labelledby="analysis-metrics-title"><h2 id="analysis-metrics-title">主要指標</h2><p className="analysis-note">割合の分母は、各配置の観察人数です。店舗全来客の人数ではありません。同じ人の再訪や同じ行動は重複して数えません。</p>
            <MetricComparison label="観察人数" before={first.observed} after={second.observed} isCount {...comparisonProps} />
            {zone ? <><h3 className="analysis-subheading">{zone.name}</h3><p className="analysis-note">各行動がこのゾーンで記録された人数です。接客率はこのゾーンで接客を開始した人数、購入率はこのゾーンの商品を購入した人数を、配置の観察人数で割った値です。</p><div className="analysis-metrics-grid analysis-zone-metrics">{zoneMetricLabels.map(([key, label]) => <MetricComparison key={key} label={label} before={first[key]} after={second[key]} {...comparisonProps} />)}</div>{[beforeAggregate, afterAggregate].some(aggregate => aggregate.zones.some(item => item.zoneId === zoneId && item.serviceCount === null)) && <p className="analysis-note" role="status">ゾーン別の接客率を表示するには、SupabaseのSQL Editorで supabase/analysis.sql を再実行し、データを再取得してください。</p>}</> : <p className="analysis-note">売場ゾーンがないため、ゾーンの行動指標はありません。</p>}
            <h3 className="analysis-subheading">配置全体</h3><div className="analysis-metrics-grid"><MetricComparison label="接客率" before={first.service} after={second.service} {...comparisonProps} /><MetricComparison label="購入率" before={first.purchase} after={second.purchase} {...comparisonProps} /></div>
          </section>
          <section className="analysis-section" aria-labelledby="analysis-service-title"><h2 id="analysis-service-title">接客あり・なしの購入率</h2><p className="analysis-note">分母はそれぞれ接客あり・なしの観察人数です。接客の効果を断定する比較ではありません。</p>{[beforeAggregate.serviceCount, beforeAggregate.withoutServiceCount, afterAggregate.serviceCount, afterAggregate.withoutServiceCount].some(count => count < 20) && <p className="analysis-note">接客あり・なしのいずれかが20人未満です。接客別購入率は参考値として確認してください。</p>}<div className="analysis-metrics-grid"><MetricComparison label="接客なし購入率" before={first.withoutServicePurchase} after={second.withoutServicePurchase} {...comparisonProps} /><MetricComparison label="接客あり購入率" before={first.withServicePurchase} after={second.withServicePurchase} {...comparisonProps} /></div></section>
          {zone && <section className="analysis-section" aria-labelledby="analysis-funnel-title"><h2 id="analysis-funnel-title">商品ファネル</h2><p className="analysis-subheading">{zone.name}</p><ProductFunnel before={first} after={second} {...comparisonProps} /></section>}
          <section className="analysis-section" aria-labelledby="analysis-maps-title"><h2 id="analysis-maps-title">マップ上の通過率</h2><p className="analysis-note">分母は各配置の観察人数です。選択中の売場を枠で示します。重なったゾーンは「全ゾーンの人数を確認」でも確認できます。</p><div className="analysis-maps"><PassageMap layout={before} aggregate={beforeAggregate} label={firstLabel} selectedZone={zone} /><PassageMap layout={after} aggregate={afterAggregate} label={secondLabel} selectedZone={zone} /></div></section>
          <details className="analysis-method"><summary>集計の基準と注意</summary><p>終了・保存された観察のみを対象に、配置履歴IDで集計します。追加・削除されたゾーンは存在しない側を「—」と表示します。ゾーンIDを基準に比較するため、名前の変更後も同じゾーンを追跡できます。</p><p>いずれかの配置が20人未満の場合は参考値として表示します。購入率が上昇し、接客率が10ポイント以上変わった場合に注意を表示します。この基準は統計的な有意差を示すものではありません。接客別の人数が少ない場合も参考値として確認してください。</p><p>曜日・時間帯・観察期間・記録するスタッフなどの違いも結果に影響する可能性があります。記録されなかった行動は推測しません。</p></details>
        </>}
      </main>
    </div>
  )
}
