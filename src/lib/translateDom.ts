type TranslationState = { source: string; rendered: string }

const ATTRIBUTES = ['title', 'aria-label', 'placeholder', 'alt'] as const

// Retain the source only while the DOM still contains our last translation.
// A React update becomes the new source instead of being overwritten with stale text.
export function createDomTranslator() {
  const texts = new WeakMap<Text, TranslationState>()
  const attributes = new WeakMap<Element, Map<string, TranslationState>>()

  const translate = (value: string, previous: TranslationState | undefined, dictionary: Map<string, string>) => {
    const source = previous && value === previous.rendered ? previous.source : value
    const trimmed = source.trim()
    const translation = dictionary.get(trimmed)
    return { source, rendered: translation ? source.replace(trimmed, () => translation) : source }
  }

  return (root: HTMLElement, dictionary: Map<string, string>) => {
    const skip = (element: Element | null) => !element || !!element.closest(
      '[data-i18n-skip], [translate="no"], script, style, noscript, code, pre, [contenteditable="true"]'
    )
    const walker = root.ownerDocument.createTreeWalker(root, 4 /* SHOW_TEXT */)
    let node = walker.nextNode() as Text | null
    while (node) {
      if (!skip(node.parentElement) && !node.parentElement?.closest('textarea') && node.nodeValue?.trim()) {
        const state = translate(node.nodeValue, texts.get(node), dictionary)
        texts.set(node, state)
        if (node.nodeValue !== state.rendered) node.nodeValue = state.rendered
      }
      node = walker.nextNode() as Text | null
    }

    for (const element of root.querySelectorAll<HTMLElement>('*')) {
      if (skip(element)) continue
      const states = attributes.get(element) || new Map<string, TranslationState>()
      attributes.set(element, states)
      for (const attribute of ATTRIBUTES) {
        const value = element.getAttribute(attribute)
        if (value === null) {
          states.delete(attribute)
          continue
        }
        const state = translate(value, states.get(attribute), dictionary)
        states.set(attribute, state)
        if (value !== state.rendered) element.setAttribute(attribute, state.rendered)
      }
    }
  }
}
