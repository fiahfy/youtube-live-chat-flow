import logger from './utils/logger'

const id = chrome.runtime.id

const ClassName = {
  message: `${id}-message`,
  button: `${id}-button`,
  control: `${id}-control`,
  visible: `${id}-visible`
}

let disabled = false
let settings = null
const lines = []

const isMyName = (authorName) => {
  const span = document.querySelector('#input-container span#author-name')
  if (span) {
    return authorName === span.textContent
  }
  const button = parent.document.querySelector(
    '.html5-video-player .ytp-chrome-top-buttons .ytp-watch-later-button'
  )
  if (button) {
    // TODO: ja_JP only
    return (
      authorName ===
      button.getAttribute('title').replace(' として後で再生します', '')
    )
  }
  return false
}

const getColor = (authorType) => {
  switch (authorType) {
    case 'owner':
      return settings.ownerColor
    case 'moderator':
      return settings.moderatorColor
    case 'member':
      return settings.memberColor
    default:
      return settings.color
  }
}

const hasAuthority = (authorType) => {
  switch (authorType) {
    case 'owner':
      return settings.ownerAvatar
    case 'moderator':
      return settings.moderatorAvatar
    case 'member':
      return settings.memberAvatar
    default:
      return settings.avatar
  }
}

const createElement = (node, height) => {
  const tags = [
    'yt-live-chat-text-message-renderer',
    'yt-live-chat-paid-message-renderer'
  ]
  if (!tags.includes(node.tagName.toLowerCase())) {
    return
  }

  const authorType = node.getAttribute('author-type')
  const authorName = node.querySelector('#author-name').textContent
  const html = node.querySelector('#message').innerHTML
  const src = node.querySelector('#img').src
  const myself = isMyName(authorName)
  const purchase =
    node.querySelector('#purchase-amount') &&
    node.querySelector('#purchase-amount').textContent

  const fontSize = height * 0.8
  const color = myself
    ? settings.selfColor
    : purchase
    ? settings.paidColor
    : getColor(authorType, authorName)
  const authority = myself
    ? settings.selfAvatar
    : purchase
    ? settings.paidAvatar
    : hasAuthority(authorType, authorName)

  const element = parent.document.createElement('div')
  element.classList.add(ClassName.message)
  element.setAttribute(
    'style',
    `
    align-items: center;
    color: ${color};
    display: flex;
    font-size: ${fontSize}px;
    font-weight: bold;
    height: ${fontSize}px;
    left: 0;
    line-height: ${fontSize}px;
    position: absolute;
    vertical-align: bottom;
    white-space: nowrap;
    ${settings.extendedStyle}
  `
  )

  if (authority) {
    element.classList.add('has-auth')
    const img = parent.document.createElement('img')
    img.src = src
    img.setAttribute(
      'style',
      `
      border-radius: ${fontSize}px;
      height: ${fontSize}px;
      margin-right: 0.2em;
      object-fit: cover;
    `
    )
    element.appendChild(img)
  }

  const span = parent.document.createElement('span')
  span.innerHTML = html
  Array.from(span.childNodes).map((node) => {
    if (!node.tagName || node.tagName.toLowerCase() !== 'img') {
      return node
    }
    node.setAttribute(
      'style',
      `
      height: ${fontSize}px;
      vertical-align: bottom;
    `
    )
    return node
  })
  element.appendChild(span)

  if (purchase) {
    const textSize = fontSize * 0.5
    const span = parent.document.createElement('span')
    span.setAttribute(
      'style',
      `
      font-size: ${textSize}px;
      line-height: initial;
      margin-left: 0.5em;
    `
    )
    span.textContent = purchase
    element.appendChild(span)
  }

  return element
}

const flow = (node) => {
  if (disabled || !settings) {
    return
  }

  const video = parent.document.querySelector('.video-stream.html5-main-video')
  if (video.paused) {
    return
  }

  const height = video.offsetHeight / settings.rows
  const element = createElement(node, height)
  if (!element) {
    return
  }

  const container = parent.document.querySelector('.html5-video-container')
  container.appendChild(element)

  const millis = settings.speed * 1000
  const keyframes = [
    { transform: `translate(${container.offsetWidth}px, 0px)` },
    { transform: `translate(-${element.offsetWidth}px, 0px)` }
  ]
  const animation = element.animate(keyframes, millis)

  const now = Date.now()
  const vc = (container.offsetWidth + element.offsetWidth) / millis

  let index = lines.findIndex((messages) => {
    const message = messages[messages.length - 1]
    if (!message) {
      return true
    }
    const vt = (container.offsetWidth + message.element.offsetWidth) / millis

    const t1 = now - message.time
    const d1 = vt * t1
    if (d1 < message.element.offsetWidth) {
      return false
    }

    const t2 = t1 + container.offsetWidth / vc
    const d2 = vt * t2
    if (d2 < container.offsetWidth + message.element.offsetWidth) {
      return false
    }

    return true
  })

  const message = {
    element,
    animation,
    time: now
  }

  if (index === -1) {
    index = lines.length
  }

  if (index > settings.rows - 1 && settings.overflow === 'hidden') {
    element.remove()
    return
  }

  if (!lines[index]) {
    lines[index] = []
  }
  lines[index].push(message)

  const top = height * (0.1 + (index % settings.rows))
  const depth = element.classList.contains('has-auth')
    ? 0
    : Math.floor(index / settings.rows)
  const opacity = settings.opacity ** (depth + 1)

  element.setAttribute(
    'style',
    element.getAttribute('style') +
      `
    top: ${top}px;
    opacity: ${opacity};
  `
  )

  animation.onfinish = () => {
    element.remove()
    lines[index].shift()
  }
}

const observeChat = () => {
  const items = document.querySelector('#items.yt-live-chat-item-list-renderer')
  if (!items) {
    return
  }
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const nodes = Array.from(mutation.addedNodes)
      nodes.forEach((node) => {
        flow(node)
      })
    })
  })
  observer.observe(items, { childList: true })
}

const addVideoEventListener = () => {
  const video = parent.document.querySelector('.video-stream.html5-main-video')
  if (!video) {
    return
  }
  const callback = (e) => {
    lines
      .reduce(
        (carry, messages) => [
          ...carry,
          ...messages.map((message) => message.animation)
        ],
        []
      )
      .forEach((animation) => animation[e.type]())
  }
  video.addEventListener('pause', callback)
  video.addEventListener('play', callback)
}

const clearMessages = () => {
  Array.from(parent.document.querySelectorAll(`.${ClassName.message}`)).forEach(
    (element) => {
      element.remove()
    }
  )
}

const setupControlButton = () => {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute(
    'd',
    'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z'
  )
  path.setAttribute('fill', '#fff')

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '-8 -8 40 40')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.append(path)

  const button = document.createElement('button')
  button.classList.add(ClassName.button)
  button.classList.add('ytp-button')
  button.onclick = () => {
    chrome.runtime.sendMessage({ id: 'disabledToggled' })
  }
  button.append(svg)

  const controls = parent.document.querySelector('.ytp-right-controls')
  controls.prepend(button)
}

const updateControlButton = (disabled) => {
  const button = parent.document.querySelector(`.${ClassName.button}`)
  button.setAttribute('aria-pressed', !disabled)
}

const removeControlButton = () => {
  const button = parent.document.querySelector(`.${ClassName.button}`)
  button.remove()
}

const setupInputControl = () => {
  const leftControl = parent.document.querySelector(
    '.ytp-chrome-bottom .ytp-chrome-controls .ytp-left-controls'
  )
  const rightControl = parent.document.querySelector(
    '.ytp-chrome-bottom .ytp-chrome-controls .ytp-right-controls'
  )
  if (!leftControl || !rightControl) {
    return
  }

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z')
  path.setAttribute('fill', '#fff')

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '-8 -8 40 40')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.append(path)

  const label = document.createElement('div')
  label.setAttribute(
    'style',
    `
    margin-left: 8px;
  `
  )
  label.textContent = '0/200'

  const updateInput = (text) => {
    const length = text.length
    label.textContent = `${length}/200`
    const renderer = document.querySelector(
      'yt-live-chat-text-input-field-renderer'
    )
    const input = document.querySelector(
      'div#input.yt-live-chat-text-input-field-renderer'
    )
    const ytButton = document.querySelector('#send-button yt-button-renderer')
    const ytIcon = document.querySelector('#send-button yt-icon-button')
    const button = document.querySelector('#send-button button#button')
    if (!renderer || !input || !ytButton || !ytIcon || !button) {
      return
    }
    if (length) {
      renderer.setAttribute('has-text', '')
      ytButton.removeAttribute('disabled')
      ytIcon.removeAttribute('disabled')
      button.removeAttribute('disabled')
    } else {
      renderer.removeAttribute('has-text')
      ytButton.setAttribute('disabled', '')
      ytIcon.setAttribute('disabled', '')
      button.setAttribute('disabled', '')
    }
    input.textContent = text
  }

  const textfield = document.createElement('input')
  textfield.setAttribute('type', 'text')
  textfield.setAttribute('placeholder', 'Message')
  textfield.setAttribute('maxlength', '200')
  textfield.setAttribute(
    'style',
    `
    flex: 1;
    box-sizing: border-box;
    width: 100%;
    height: 66%;
    border: none;
    font-size: 100%;
    padding: 4px;
    outline: none;
  `
  )
  textfield.onkeydown = (e) => {
    e.stopPropagation()
    // const input = document.querySelector(
    //   'div#input.yt-live-chat-text-input-field-renderer'
    // )
    // input.dispatchEvent(e)
  }
  textfield.onkeyup = (e) => {
    updateInput(e.target.value)
  }

  const button = document.createElement('button')
  button.classList.add('ytp-button')
  button.onclick = () => {
    const button = document.querySelector('#send-button button#button')
    logger.log(button)

    // button.click()
    // textfield.value = ''
    // updateInput('')

    const input = document.querySelector(
      'div#input.yt-live-chat-text-input-field-renderer'
    )
    input.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13 }))
  }
  button.append(svg)

  const width = `calc(100% - ${leftControl.offsetWidth +
    rightControl.offsetWidth +
    1}px)`

  const control = document.createElement('div')
  control.classList.add(ClassName.control)
  control.setAttribute(
    'style',
    `
    float: left;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding: 0 8px;
    height: 100%;
    width: ${width};
  `
  )
  control.append(textfield)
  control.append(label)
  control.append(button)

  rightControl.parentNode.insertBefore(control, rightControl)

  parent.document.body.classList.add(ClassName.visible)
}

const removeInputControl = () => {
  const button = parent.document.querySelector(`.${ClassName.control}`)
  button.remove()
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  logger.log('chrome.runtime.onMessage', message, sender, sendResponse)

  const { id, data } = message
  switch (id) {
    case 'disabledChanged':
      disabled = data.disabled
      updateControlButton(disabled)
      if (disabled) {
        clearMessages()
      }
      break
    case 'stateChanged':
      settings = data.state.settings
      break
  }
})

document.addEventListener('DOMContentLoaded', async () => {
  chrome.runtime.sendMessage({ id: 'contentLoaded' })

  observeChat()
  addVideoEventListener()
  setupControlButton()
  setupInputControl()

  window.addEventListener('unload', () => {
    clearMessages()
    removeInputControl()
    removeControlButton()
  })
})

logger.log('content script loaded')
