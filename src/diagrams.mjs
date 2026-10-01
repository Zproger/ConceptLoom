function cleanSource(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be non-empty text`);
  const source = value.trim();
  if (source.includes("```")) throw new Error(`${label} must not include Markdown fences`);
  return source;
}

export function prepareMermaid(input) {
  const source = cleanSource(input.source, "source");
  return {
    format: "mermaid",
    label: typeof input.label === "string" ? input.label.trim() : "",
    source,
    markdown: `\`\`\`mermaid\n${source}\n\`\`\``,
    instructions: "Show this Mermaid block directly in the response and optionally append it to the Markdown notebook.",
  };
}

export function prepareTextDiagram(input) {
  const source = cleanSource(input.source, "source");
  return {
    format: "text",
    label: typeof input.label === "string" ? input.label.trim() : "",
    source,
    markdown: `\`\`\`text\n${source}\n\`\`\``,
    instructions: "Show this monospace diagram directly in the terminal response and optionally append it to the Markdown notebook.",
  };
}
