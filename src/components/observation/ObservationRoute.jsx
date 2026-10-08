import { useEffect, useRef } from 'react'

export default function ObservationRoute({ steps }) {
  const routeRef = useRef(null)
  useEffect(() => { if (routeRef.current) routeRef.current.scrollLeft = routeRef.current.scrollWidth }, [steps])
  return (
    <div ref={routeRef} className="observation-route" aria-label="記録したルート" aria-live="polite">
      {steps.length === 0 ? <p>マップをタップしてルートを記録</p> : (
        <ol>{steps.map((step, index) => (
          <li key={index}><span className="observation-route__number">{index + 1}</span>{step.zoneName}{index < steps.length - 1 && <span aria-hidden="true">→</span>}</li>
        ))}</ol>
      )}
    </div>
  )
}
