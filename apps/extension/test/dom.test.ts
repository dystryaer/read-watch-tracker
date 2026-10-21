// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { h } from "../src/lib/dom";

describe("h", () => {
  it("creates elements with attributes and text children", () => {
    const element = h("p", { class: "note" }, "Hallo ", h("strong", {}, "Welt"));
    expect(element.outerHTML).toBe('<p class="note">Hallo <strong>Welt</strong></p>');
  });

  it("inserts strings as text, never as markup", () => {
    const element = h("span", {}, '<img src=x onerror="alert(1)">');
    expect(element.querySelector("img")).toBeNull();
    expect(element.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it("refuses event handler attributes", () => {
    expect(() => h("button", { onclick: "alert(1)" })).toThrow();
    expect(() => h("button", { OnMouseOver: "alert(1)" })).toThrow();
  });

  it("only accepts http(s) links", () => {
    expect(h("a", { href: "https://tracker.example/pair?code=K7P3QX" }).getAttribute("href")).toBe(
      "https://tracker.example/pair?code=K7P3QX",
    );
    expect(() => h("a", { href: "javascript:alert(1)" })).toThrow();
    expect(() => h("img", { src: "data:image/svg+xml,<svg onload=alert(1)>" })).toThrow();
  });

  it("refuses inline style attributes, which the strict policy would block anyway", () => {
    expect(() => h("div", { style: "background:url(javascript:alert(1))" })).toThrow();
  });

  it.each([["formaction"], ["srcdoc"], ["action"], ["xlink:href"], ["poster"], ["src"]])(
    "refuses the attribute %j, which is not on the allowlist",
    (name) => {
      expect(() => h("button", { [name]: "https://tracker.example" })).toThrow();
    },
  );

  it("accepts the attributes the popup and options page use", () => {
    const input = h("input", {
      type: "text",
      name: "apiUrl",
      value: "x",
      placeholder: "https://…",
      autocomplete: "off",
      maxlength: "100",
      required: "",
      class: "wide",
      "aria-label": "Adresse",
      role: "status",
    });
    expect(input.getAttribute("aria-label")).toBe("Adresse");
  });

  it("skips null children", () => {
    expect(h("div", {}, null, "x").textContent).toBe("x");
  });
});
