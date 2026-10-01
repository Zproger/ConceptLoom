#!/usr/bin/env node
import readline from "node:readline";
import { composeCheckpoint, assessCheckpoint } from "./checkpoints.mjs";
import { beginNotebook, addNotebookEntry } from "./notebook.mjs";
import { prepareMermaid, prepareTextDiagram } from "./diagrams.mjs";
import { loadLearningState, recordCheckpointAssessment, saveLearningState } from "./progress.mjs";

const PROTOCOL_VERSION = "2025-06-18";
const workspace = process.cwd();

const toolCatalog = [
  {
    name: "loom_frame_checkpoint",
    description: "Create a shuffled knowledge checkpoint without revealing the expected answer. Present the returned choices to the learner, then call loom_assess_checkpoint with their selection.",
    inputSchema: {
      type: "object",
      required: ["prompt", "choices", "expected", "rationale"],
      properties: {
        prompt: { type: "string" },
        choices: {
          type: "array",
          minItems: 2,
          items: {
            type: "object",
            required: ["key", "label"],
            properties: { key: { type: "string" }, label: { type: "string" } },
          },
        },
        expected: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
        rationale: { type: "string" },
        multiple: { type: "boolean", default: false },
        mix: { type: "boolean", default: true },
      },
    },
  },
  {
    name: "loom_assess_checkpoint",
    description: "Grade a checkpoint and atomically persist its resume point. Call immediately after the learner answers, before any explanation or next question. Use __gap__ for 'I do not know yet'.",
    inputSchema: {
      type: "object",
      required: ["token", "selected", "sessionId", "nextStep"],
      properties: {
        token: { type: "string" },
        selected: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
        sessionId: { type: "string" },
        currentStep: { type: "string" },
        nextStep: { type: "string", description: "Exact action to resume with if the client closes immediately after assessment." },
        securedConnection: { type: "string", description: "Connection to mark secure only when the answer is accurate." },
        gap: { type: "string", description: "Gap to record when the learner selects __gap__." },
        note: { type: "string" },
      },
    },
  },
  {
    name: "loom_start_notebook",
    description: "Create or open a Markdown learning notebook inside the current workspace.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", default: "learning-notes.md" },
        title: { type: "string" },
        replace: { type: "boolean", default: false },
      },
    },
  },
  {
    name: "loom_add_note",
    description: "Append a structured learning event to a notebook created with loom_start_notebook.",
    inputSchema: {
      type: "object",
      required: ["path", "kind", "body"],
      properties: {
        path: { type: "string" },
        kind: { enum: ["learner", "guide", "prompt", "response", "insight", "diagram"] },
        body: { type: "string" },
        title: { type: "string" },
      },
    },
  },
  {
    name: "loom_save_learning_state",
    description: "Persist the current route and exact resume point. After every learner response, call this before producing the next explanation or question. Save route approval as phase=build before teaching begins.",
    inputSchema: {
      type: "object",
      required: ["sessionId", "topic", "goal", "phase", "nextStep"],
      properties: {
        sessionId: { type: "string", description: "Stable short id, for example ja4-basics." },
        topic: { type: "string" },
        goal: { type: "string" },
        phase: { enum: ["locate", "weave", "build", "complete"] },
        notebookPath: { type: "string" },
        route: { type: "array", items: { type: "string" } },
        secured: { type: "array", items: { type: "string" } },
        gaps: { type: "array", items: { type: "string" } },
        currentStep: { type: "string" },
        nextStep: { type: "string" },
        learnerContext: { type: "string" },
      },
    },
  },
  {
    name: "loom_load_learning_state",
    description: "Load a saved learning session from the workspace. Without sessionId, returns the most recently updated state and a list of all saved sessions. Always call when the learner asks to continue or resume.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
    },
  },
  {
    name: "loom_show_relation_map",
    description: "Prepare a Mermaid diagram to show directly in the terminal response and optionally save in the Markdown notebook. Does not create an image file.",
    inputSchema: {
      type: "object",
      required: ["source", "label"],
      properties: { source: { type: "string" }, label: { type: "string" } },
    },
  },
  {
    name: "loom_show_text_diagram",
    description: "Prepare a compact monospace text diagram to show directly in the terminal response and optionally save in the Markdown notebook.",
    inputSchema: {
      type: "object",
      required: ["source", "label"],
      properties: { source: { type: "string" }, label: { type: "string" } },
    },
  },
];

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

async function invokeTool(name, args) {
  switch (name) {
    case "loom_frame_checkpoint": return textResult(composeCheckpoint(args));
    case "loom_assess_checkpoint": {
      const assessment = assessCheckpoint(args);
      const learningState = await recordCheckpointAssessment(workspace, args, assessment);
      return textResult({ ...assessment, learningState });
    }
    case "loom_start_notebook": {
      const path = await beginNotebook(workspace, args);
      return textResult({ path });
    }
    case "loom_add_note": {
      const path = await addNotebookEntry(workspace, args);
      return textResult({ path });
    }
    case "loom_save_learning_state": return textResult(await saveLearningState(workspace, args));
    case "loom_load_learning_state": return textResult(await loadLearningState(workspace, args));
    case "loom_show_relation_map": return textResult(prepareMermaid(args));
    case "loom_show_text_diagram": return textResult(prepareTextDiagram(args));
    default: throw new Error(`unknown tool: ${name}`);
  }
}

async function route(message) {
  const { id, method, params = {} } = message;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "concept-loom", version: "1.0.0" },
        instructions: "Use loom tools with the Concept Loom coaching skill. Never expose expected checkpoint answers before the learner responds.",
      },
    };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: toolCatalog } };
  if (method === "tools/call") {
    try {
      const result = await invokeTool(params.name, params.arguments || {});
      return { jsonrpc: "2.0", id, result };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id,
        result: { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] },
      };
    }
  }
  if (typeof id === "undefined") return null;
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } };
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", async (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } })}\n`);
    return;
  }
  try {
    const response = await route(message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id ?? null, error: { code: -32603, message: String(error) } })}\n`);
  }
});
