export function installPressFeedback() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  const springs = new WeakMap<HTMLElement, Animation>()

  function controlOf(event: Event) {
    if (!(event.target instanceof Element)) return null
    const control = event.target.closest<HTMLElement>("button, a[class][href]")
    return control?.matches(":disabled, [aria-disabled='true'], [data-custom-press]") ? null : control
  }

  function stopSpring(event: PointerEvent) {
    const control = controlOf(event)
    if (control) springs.get(control)?.cancel()
  }

  function spring(event: MouseEvent) {
    if (reducedMotion.matches || event.button !== 0) return
    const control = controlOf(event)
    if (!control || typeof control.animate !== "function") return

    springs.get(control)?.cancel()
    springs.set(control, control.animate([
      { scale: "var(--client-press-scale)", translate: "0 2px", offset: 0 },
      { scale: "var(--client-rebound-scale)", translate: "0 -1px", offset: 0.56 },
      { scale: 1, translate: "0 0", offset: 1 },
    ], { duration: 165, easing: "cubic-bezier(.2,.7,.3,1)" }))
  }

  document.addEventListener("pointerdown", stopSpring, true)
  document.addEventListener("click", spring, true)
  return () => {
    document.removeEventListener("pointerdown", stopSpring, true)
    document.removeEventListener("click", spring, true)
  }
}
