import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { createApiClient } from './apiClient.js'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './styles.css'

window.electronAPI = createApiClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
