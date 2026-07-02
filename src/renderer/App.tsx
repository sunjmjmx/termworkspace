import React from 'react'
import { SplitPane } from './components/SplitPane'
import { TabBar } from './components/TabBar'
import { useTabState } from './hooks/useTabState'

function App(): React.ReactElement {
  const {
    tabs,
    activeTab,
    activeTabId,
    setActiveTree,
    createTab,
    closeTab,
    switchTab,
  } = useTabState()

  return (
    <div className="app">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSwitch={switchTab}
        onClose={closeTab}
        onCreate={createTab}
      />
      <div className="app-content">
        <SplitPane
          key={activeTabId}
          tree={activeTab.tree}
          onTreeChange={setActiveTree}
        />
      </div>
    </div>
  )
}

export default App
