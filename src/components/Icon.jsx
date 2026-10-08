const shapes = {
  flow: (
    <>
      <circle cx="5" cy="18" r="2" />
      <path d="M5 16V7a3 3 0 0 1 3-3h5a3 3 0 0 1 3 3v10a3 3 0 0 0 3 3" />
      <path d="m16 17 3 3 3-3" />
    </>
  ),
  store: (
    <>
      <path d="M4 10v10h16V10M3 10l2-6h14l2 6" />
      <path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-6h6v6" />
    </>
  ),
  layout: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 10h18M10 10v11M15 3v7" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  undo: <path d="M3 4v7h7M3 11a8 8 0 1 1 2 8" />,
  stop: <path d="M8 5v14M16 5v14" />,
  touch: <path d="M9 12V5a2 2 0 0 1 4 0v7l1-3a2 2 0 0 1 3 0l1 2a2 2 0 0 1 3 1v5a5 5 0 0 1-5 5h-3a5 5 0 0 1-4-2l-5-6a2 2 0 0 1 3-3l2 1Z" />,
  tag: <><path d="M3 3h7l11 11-7 7L3 10V3Z" /><circle cx="7" cy="7" r="1" /></>,
  back: <path d="M19 12H5m5-5-5 5 5 5" />,
  door: (
    <>
      <path d="M4 21h16M6 21V3h12v18M14 12h.01" />
    </>
  ),
  register: (
    <>
      <path d="M4 13h16v8H4zM7 13V8h10l2 5M9 8V3h8v5M7 17h4M15 17h2" />
    </>
  ),
  fitting: (
    <>
      <path d="M9 6a3 3 0 1 1 3 3v3L3 18v2h18v-2l-9-6" />
    </>
  ),
  resize: <path d="M9 3H3v6M3 3l7 7M15 21h6v-6m0 6-7-7" />,
  trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />,
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  people: (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6M21 20v-2a6 6 0 0 0-4-5.65" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l1 13H4L5 8Z" />
      <path d="M8 9V6a4 4 0 0 1 8 0v3" />
    </>
  ),
  chart: <path d="M4 3v17h17M9 15v-4M14 15V7M19 15V4" />,
  history: (
    <>
      <path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7" />
      <path d="M12 7v5l3 2" />
    </>
  ),
}

export default function Icon({ name, className = '' }) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes[name]}
    </svg>
  )
}
