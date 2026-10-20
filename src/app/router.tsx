import { createBrowserRouter } from 'react-router-dom'
import { RootLayout } from './RootLayout.tsx'
import { LandingPage } from '../features/landing/LandingPage.tsx'
import { DeviceCheckPage } from '../features/onboarding/DeviceCheckPage.tsx'
import { ShopPage } from '../features/shop/ShopPage.tsx'
import { NotFoundPage } from '../features/misc/NotFoundPage.tsx'
import { RequireSession } from '../features/session/RequireSession.tsx'
import { CalibratePage } from '../features/tracking/CalibratePage.tsx'
import { RequireCamera } from '../features/tracking/RequireCamera.tsx'

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'check', element: <DeviceCheckPage /> },
      {
        path: 'calibrate',
        element: (
          <RequireCamera>
            <CalibratePage />
          </RequireCamera>
        ),
      },
      {
        path: 'shop',
        element: (
          <RequireSession>
            <ShopPage />
          </RequireSession>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
