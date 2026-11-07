export async function registerMapAssetWorker() {
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}map-assets-sw.js`, {
      type: 'module',
      scope: import.meta.env.BASE_URL,
      updateViaCache: 'none',
    })
  } catch {
    // Enhancement only: registration failure must not prevent the application from opening.
  }
}
