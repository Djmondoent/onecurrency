import recieveSoundUrl from '../assets/recievesound.wav'
import sendSoundUrl from '../assets/sendsound.wav'

const receiveAudio = typeof Audio !== 'undefined' ? new Audio(recieveSoundUrl) : null
const sendAudio = typeof Audio !== 'undefined' ? new Audio(sendSoundUrl) : null

export const playReceiveSound = () => {
  if (!receiveAudio) return
  try {
    receiveAudio.currentTime = 0
    receiveAudio.play().catch(() => {})
  } catch {
    // Ignore playback failures (e.g., browser autoplay restrictions)
  }
}

export const playSendSound = () => {
  if (!sendAudio) return
  try {
    sendAudio.currentTime = 0
    sendAudio.play().catch(() => {})
  } catch {
    // Ignore playback failures (e.g., browser autoplay restrictions)
  }
}
