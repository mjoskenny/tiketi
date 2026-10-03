import React from 'react'
import ReactDOM from 'react-dom/client'
import './lib/i18n'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { LocaleContent } from './components/LocaleContent'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <LocaleContent>
        <App />
      </LocaleContent>
    </AuthProvider>
  </React.StrictMode>,
)
