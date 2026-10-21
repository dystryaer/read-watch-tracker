import { safeHref } from "@rwt/core";

type Child = Node | string | null;

/**
 * Builds DOM for the popup and options page. Strings always become text nodes, event-handler and
 * style attributes are refused and links must be http(s): titles coming from manga sites can never
 * turn into markup or script.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    const lower = name.toLowerCase();
    if (lower.startsWith("on") || lower === "style") throw new Error(`Attribute "${name}" is not allowed`);
    if (lower === "href" || lower === "src") {
      const safe = safeHref(value);
      if (!safe) throw new Error(`Unsafe URL in "${name}"`);
      element.setAttribute(name, safe);
      continue;
    }
    element.setAttribute(name, value);
  }
  for (const child of children) if (child !== null) element.append(child);
  return element;
}

/** Replaces the content of `root` with the given children. */
export function render(root: Element, ...children: Child[]): void {
  root.replaceChildren(...children.filter((child): child is Node | string => child !== null));
}
