// Shadow-safe DOM querying helpers for components mounted inside Shadow DOM.
// Keep scope minimal and side-effect free.

export function getTreeRoot(node: Node): Document | ShadowRoot {
  const root = (node as any)?.getRootNode?.();
  if (
    root &&
    (root as Document | ShadowRoot).nodeType === Node.DOCUMENT_FRAGMENT_NODE
  ) {
    return root as ShadowRoot;
  }
  return (root as Document) || document;
}

// Find an element by id within the same DOM tree (shadow or document)
export function getById<T extends HTMLElement = HTMLElement>(
  start: Element,
  id: string
): T | null {
  const root = getTreeRoot(start);
  // ShadowRoot and Document both implement getElementById in modern browsers
  const found = (root as any).getElementById?.(id) as T | null | undefined;
  return found ?? null;
}

// Query using a selector within the same tree as `start`.
export function query<T extends Element = Element>(
  start: Element,
  selector: string
): T | null {
  // When `start` is inside a shadow, querying from it keeps scope within the shadow subtree.
  return (start.querySelector(selector) as T | null) ?? null;
}

// Query all matching elements within the same tree as `start`.
export function queryAll<T extends Element = Element>(
  start: Element,
  selector: string
): T[] {
  return Array.from(start.querySelectorAll(selector)) as T[];
}
