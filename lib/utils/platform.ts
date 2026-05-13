export function isWeChatBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}

export function isIOSWechat(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  return /MicroMessenger/i.test(ua) && /iPhone|iPad|iPod/i.test(ua);
}

export function supportsSpeechRecognition(): boolean {
  if (typeof window === "undefined") return false;
  if (isWeChatBrowser()) return false;
  const win = window as unknown as Record<string, unknown>;
  return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
}
