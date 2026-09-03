import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@16-bits-design/ui/styles.css'
// After the library, so the custom theme's palette and the app's own overrides
// of the library's (specificity-free) element defaults both win on source order.
import './theme-nebula.css'
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
