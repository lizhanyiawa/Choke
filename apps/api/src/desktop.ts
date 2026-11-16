import { existsSync } from "node:fs"
import { createServer as createSocket } from "node:net"
import path from "node:path"
import type { FastifyInstance } from "fastify"
import type { PreviewServer, ViteDevServer } from "vite"

const root = path.resolve(import.meta.dirname, "../../..")
const mode = process.argv[2]
if (mode !== "game" && mode !== "test" && mode !== "developer") throw new Error("无效的 Choke 启动模式")
const playtest = mode !== "game"
const developer = mode === "developer"
const host = playtest ? "127.0.0.1" : "localhost"
const apiPort = playtest ? 3320 : 3100
const webPort = playtest ? 5273 : 5173
const apiOrigin = `http://${host}:${apiPort}`
const webOrigin = `http://${host}:${webPort}`
const readyPath = playtest ? "/developer/state" : "/health"
const marker = playtest ? '"playtest":true' : '"status":"up"'

async function responds(url: string, expected: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(800), redirect: "error" })
    return response.ok && (await response.text()).includes(expected)
  } catch {
    return false
  }
}

async function checkPort(port: number) {
  await new Promise<void>((resolve, reject) => {
    const socket = createSocket()
    socket.once("error", error => reject(new Error(`端口 ${port} 无法使用。请检查是否有其他程序占用。`, { cause: error })))
    socket.listen({ host, port, exclusive: true }, () => socket.close(error => error ? reject(error) : resolve()))
  })
}

// Closing the window closes this pipe, including when the desktop process exits unexpectedly.
let closing = false
const shutdown = new Promise<void>(resolve => {
  const stop = () => { closing = true; resolve() }
  process.stdin.once("end", stop)
  process.stdin.once("error", stop)
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  process.stdin.resume()
})

let api: FastifyInstance | undefined
let web: PreviewServer | ViteDevServer | undefined
try {
  const [apiReady, webReady] = await Promise.all([
    responds(apiOrigin + readyPath, marker),
    responds(webOrigin + "/", "<title>Choke!"),
  ])
  if (!webReady && !developer && !existsSync(path.join(root, "dist", "index.html"))) {
    throw new Error("找不到已构建的游戏资源。请运行 scripts/build-desktop.ps1 构建客户端。")
  }
  // Check for conflicts before opening a database. Any existing healthy Choke service can be reused.
  await Promise.all([
    apiReady ? undefined : checkPort(apiPort),
    webReady ? undefined : checkPort(webPort),
  ])
  if (!closing && !apiReady) {
    api = playtest
      ? await (await import("./playtest")).createPlaytestApi(process.env.CHOKE_DESKTOP_TEST_PROFILE)
      : await (await import("./app")).createGameApi()
    if (!closing) await api.listen({ host, port: apiPort })
  }
  if (!closing && !webReady) {
    process.env.CHOKE_VITE_API_TARGET = apiOrigin
    const vite = await import("vite")
    const bind = { host, port: webPort, strictPort: true }
    if (developer) {
      web = await vite.createServer({ root, server: bind })
      await web.listen()
    } else {
      web = await vite.preview({ root, preview: bind })
    }
  }
  if (!closing) {
    if (!await responds(webOrigin + "/api" + readyPath, marker)) throw new Error("游戏页面无法连接本机 API。")
    if (!closing) {
      console.log("CHOKE_DESKTOP_READY")
      await shutdown
    }
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  process.stdin.pause()
  try {
    await web?.close()
  } finally {
    await api?.close()
  }
}
