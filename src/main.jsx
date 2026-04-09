import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import SubmitArtPage from './pages/SubmitArtPage.jsx'
import ModeratePage from './pages/ModeratePage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/submit" element={<SubmitArtPage />} />
          <Route path="/moderate" element={<ModeratePage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
)
