import { useCallback, useEffect, useState } from "react"

interface Result<T> {
  data: T | null
  error: string | null
}

type Loader<T> = (signal: AbortSignal) => Promise<T>

/** 换筛选、翻页或重试时，旧结果不能再被作为当前数据使用。load 由调用方稳定引用。 */
export function useResource<T>(load: Loader<T> | null) {
  const [revision, setRevision] = useState(0)
  const [settled, setSettled] = useState<(Result<T> & { load: Loader<T>; revision: number }) | null>(null)
  const reload = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!load) return
    const controller = new AbortController()
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setSettled({ load, revision, data, error: null })
      },
      (reason: unknown) => {
        if (!controller.signal.aborted) {
          setSettled({ load, revision, data: null, error: reason instanceof Error ? reason.message : "读取失败" })
        }
      },
    )
    return () => controller.abort()
  }, [load, revision])

  const current = settled?.load === load && settled.revision === revision ? settled : null
  return { data: current?.data ?? null, error: current?.error ?? null, reload }
}
