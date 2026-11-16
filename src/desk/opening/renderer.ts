let webglSupport: boolean | undefined

export function prefersPackWebGL() {
  if (localStorage.getItem("choke.quality") === "light") return false
  if (webglSupport === undefined) {
    try {
      const canvas = document.createElement("canvas")
      webglSupport = !!(canvas.getContext("webgl2") || canvas.getContext("webgl"))
    } catch {
      webglSupport = false
    }
  }
  return webglSupport
}
