import { createGameApi } from "./app"

const app = await createGameApi()
const port = Number(process.env.PORT ?? 3100)
await app.listen({ port, host: "0.0.0.0" })
