// Template HTML seguro: toda interpolação é escapada, exceto fragmentos SafeHtml.

export class SafeHtml {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}

export type HtmlValue =
  | SafeHtml
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | readonly HtmlValue[];

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** Conteúdo confiável, gerado pelo próprio código, inserido sem escapar. */
export function raw(text: string): SafeHtml {
  return new SafeHtml(text);
}

function render(value: HtmlValue): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return (value as readonly HtmlValue[]).map(render).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(String(value));
}

/** Tagged template: `html\`<p>${texto}</p>\`` → SafeHtml com os valores escapados. */
export function html(strings: TemplateStringsArray, ...values: readonly HtmlValue[]): SafeHtml {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i += 1) {
    out += render(values[i]);
    out += strings[i + 1] ?? '';
  }
  return new SafeHtml(out);
}
