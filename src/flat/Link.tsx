import type { AnchorHTMLAttributes, MouseEvent } from "react"

import { navigate } from "./router"

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  /** 壳内页面的地址（FLAT_ROUTES 里的值） */
  to: string
}

/** 壳内链接：普通左键点击只换页不重新加载；带修饰键或中键照浏览器默认（开新标签页） */
export function Link({ to, onClick, ...rest }: Props) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
  }
  return <a {...rest} href={to} onClick={handleClick} />
}
