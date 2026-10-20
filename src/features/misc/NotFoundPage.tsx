import { Link } from 'react-router-dom'
import { Brand } from '../../components/Brand.tsx'
import { ArrowIcon } from '../../components/Icons.tsx'
import './not-found.css'

export function NotFoundPage() {
  return (
    <div className="notfound">
      <header className="notfound__bar">
        <Brand />
      </header>
      <main className="notfound__body" id="main">
        <p className="eyebrow">404 · Wrong turn</p>
        <h1>
          Nothing <em>here.</em>
        </h1>
        <p>The door you were looking for does not exist.</p>
        <Link className="btn btn--signal" to="/">
          Back to the entrance
          <ArrowIcon />
        </Link>
      </main>
    </div>
  )
}
