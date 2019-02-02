import { defaults } from './store/settings'
import logger from './utils/logger'
import storage from './utils/storage'
import iconOff from './assets/icon-off48.png'
import iconOn from './assets/icon-on48.png'
import './assets/icon16.png'
import './assets/icon48.png'
import './assets/icon128.png'

const id = chrome.runtime.id

const ClassName = {
  visible: `${id}-visible`
}

const code = `
.${ClassName.visible} .html5-video-player .ytp-chrome-bottom {
  opacity: 1!important;
}
.${ClassName.visible} .html5-video-player .ytp-gradient-bottom {
  display: block!important;
  opacity: 1!important;
}
`

let initialDisabled = false
const disabledTabs = {}

const setIcon = (tabId) => {
  const path = disabledTabs[tabId] ? iconOff : iconOn
  chrome.pageAction.setIcon({ tabId, path })
}

const contentLoaded = async (tabId) => {
  chrome.tabs.insertCSS(tabId, { code })
  const disabled = initialDisabled
  disabledTabs[tabId] = disabled
  setIcon(tabId)
  chrome.tabs.sendMessage(tabId, {
    id: 'disabledChanged',
    data: { disabled }
  })
  const state = await storage.get()
  chrome.tabs.sendMessage(tabId, {
    id: 'stateChanged',
    data: { state }
  })
  chrome.pageAction.show(tabId)
}

const disabledToggled = (tabId) => {
  const disabled = !disabledTabs[tabId]
  initialDisabled = disabled
  disabledTabs[tabId] = disabled
  setIcon(tabId)
  chrome.tabs.sendMessage(tabId, {
    id: 'disabledChanged',
    data: { disabled }
  })
}

const stateChanged = async () => {
  const state = await storage.get()
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, {
        id: 'stateChanged',
        data: { state }
      })
    })
  })
}

chrome.runtime.onInstalled.addListener(async (details) => {
  logger.log('chrome.runtime.onInstalled', details)

  const state = {
    settings: defaults,
    ...(await storage.get())
  }
  await storage.set(state)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logger.log('chrome.runtime.onMessage', message, sender, sendResponse)

  const { id } = message
  const { tab } = sender
  switch (id) {
    case 'contentLoaded':
      contentLoaded(tab.id)
      break
    case 'disabledToggled':
      disabledToggled(tab.id)
      break
    case 'stateChanged':
      stateChanged()
      break
  }
})

chrome.pageAction.onClicked.addListener((tab) => {
  logger.log('chrome.pageAction.onClicked', tab)
  disabledToggled(tab.id)
})

logger.log('background script loaded')
