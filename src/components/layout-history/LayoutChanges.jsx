export default function LayoutChangeReason({ changeNote }) {
  return (
    <div className="layout-changes">
      <section className="layout-change-reason" aria-label="入力された変更理由">
        <h3>変更理由</h3>
        <p>{changeNote || '変更理由の記入はありません。'}</p>
      </section>
    </div>
  )
}
