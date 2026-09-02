import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@16-bits-design/ui/styles.css'
import './styles.css'
import { App } from './App.js'

const container = document.getElementById('root')
if (!container) {
  throw new Error('index.html is missing its #root element.')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
