import { Link } from 'react-router-dom'

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="12.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="5.2" fill="currentColor" />
      <circle className="brand__pupil" cx="18.4" cy="13.6" r="1.35" />
    </svg>
  )
}

export function Brand({
  to = '/',
  onClick,
}: {
  to?: string
  onClick?: () => void
}) {
  return (
    <Link to={to} className="brand" onClick={onClick}>
      <BrandMark className="brand__mark" />
      <span className="brand__word">Portico</span>
    </Link>
  )
}
