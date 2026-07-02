import React from 'react'

function App(): React.ReactElement {
  return (
    <div className="app">
      <div className="app-header">
        <h1>Hello TermWorkspace v2</h1>
        <p className="app-subtitle">
          Electron + React + Vite {window.electronAPI?.platform ?? 'web'}
        </p>
      </div>
    </div>
  )
}

export default App
