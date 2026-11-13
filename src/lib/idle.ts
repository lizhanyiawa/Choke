/** 空闲时执行；Safari 没有 requestIdleCallback，退回 setTimeout。返回取消函数。 */
export function onIdle(callback: () => void, timeout: number): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(callback, 1)
  return () => window.clearTimeout(id)
}
