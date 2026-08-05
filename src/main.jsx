import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import { createApiClient } from './apiClient.js'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './styles.css'

registerSW({ immediate: true })

window.electronAPI = createApiClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
