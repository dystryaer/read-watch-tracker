import { safeHref } from "@rwt/core";

type Child = Node | string | null;

// Everything the popup and options page need; anything else (formaction, srcdoc, on*, style …) is refused.
const ALLOWED_ATTRIBUTES = new Set([
  "autocomplete",
  "checked",
  "class",
  "disabled",
  "for",
  "href",
  "id",
  "maxlength",
  "name",
  "placeholder",
  "rel",
  "required",
  "role",
  "target",
  "title",
  "type",
  "value",
]);

/**
 * Builds DOM for the popup and options page. Strings always become text nodes, only allowlisted
 * attributes are set and links must be http(s): titles coming from manga sites can never turn
 * into markup or script.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    const lower = name.toLowerCase();
    if (!ALLOWED_ATTRIBUTES.has(lower) && !/^aria-[a-z]+$/.test(lower)) throw new Error(`Attribute "${name}" is not allowed`);
    if (lower === "href") {
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
