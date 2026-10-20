import { Outlet, ScrollRestoration } from 'react-router-dom'
import { MediaSessionProvider } from '../features/session/MediaSessionProvider.tsx'

export function RootLayout() {
  return (
    <MediaSessionProvider>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Outlet />
      <ScrollRestoration />
    </MediaSessionProvider>
  )
}
