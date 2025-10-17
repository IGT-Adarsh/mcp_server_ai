import Ajv from "ajv";
import type {
  EmitFilesPayload,
  BuildModuleTreePayload,
  RunCmdSchema,
} from "../../chat.types";

export const ajv = new Ajv({ allErrors: true, strict: false });

export const emitFilesSchema = {
  type: "object",
  properties: {
    projectId: { type: "string" },
    operations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          action: { type: "string", enum: ["create", "update", "delete"] },
          content: { type: "string" },
          encoding: { type: "string", enum: ["utf8", "base64"] },
        },
        required: ["path", "action"],
      },
    },
  },
  required: ["projectId", "operations"],
};

export const buildModuleTreeSchema = {
  type: "object",
  properties: {
    projectName: { type: "string" },
    prompt: { type: "object" },
    root: { type: "object" },
  },
  required: ["projectName"],
};

export const runCmdSchema = {
  type: "object",
  properties: {
    projectId: { type: "string" },
    cmd: { type: "string" },
    command: { type: "string" },
    args: { type: "array", items: { type: "string" } },
    options: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        env: { type: "object" },
        timeoutMs: { type: "number" },
      },
    },
  },
  required: ["projectId"],
};

export const validateEmitFiles = ajv.compile<EmitFilesPayload>(emitFilesSchema);
export const validateBuildModuleTree = ajv.compile<BuildModuleTreePayload>(
  buildModuleTreeSchema
);

export const validateRunCmd = ajv.compile<RunCmdSchema>(runCmdSchema);
// src/utils/tools.ts
export const PROJECT_TOOLS = [
  {
    name: "build_module_tree_from_prompt",
    type: "function",
    description:
      "Build a nested ModuleNode tree. The assistant should call this function and pass an object containing `moduleTree` (root ModuleNode).",
    function: {
      name: "build_module_tree_from_prompt",
      description: "Same as above",
      parameters: {
        type: "object",
        properties: {
          projectName: { type: "string" },
          prompt: { type: "string" },
          moduleTree: { $ref: "#/$defs/moduleNode" },
          options: { type: "object", additionalProperties: true },
        },
        required: ["moduleTree"],
        additionalProperties: false,
        $defs: {
          moduleNode: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              files: { type: "array", items: { type: "string" } },
              children: {
                type: "array",
                items: { $ref: "#/$defs/moduleNode" },
              },
              meta: { type: "object", additionalProperties: true },
            },
            required: ["id", "name"],
            additionalProperties: true,
          },
        },
      },
    },
  },

  {
    name: "emitFiles",
    type: "function",
    description: "Return { operations: FileOperation[] }",
    function: {
      name: "emitFiles",
      description: "Return operations array",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          operations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                action: {
                  type: "string",
                  enum: ["create", "update", "delete"],
                },
                content: { type: "string" },
                encoding: { type: "string", enum: ["utf-8", "base64"] },
                meta: { type: "object", additionalProperties: true },
              },
              required: ["path", "action"],
              additionalProperties: true,
            },
            minItems: 0,
          },
        },
        required: ["operations"],
        additionalProperties: false,
      },
    },
  },

  {
    name: "run_cmd",
    type: "function",
    description: "Return a command object",
    function: {
      name: "run_cmd",
      description: "Return a command object",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          command: { type: "string" },
          args: { type: "array", items: { type: "string" } },
          options: { type: "object", additionalProperties: true },
        },
        required: ["command"],
        additionalProperties: true,
      },
    },
  },
] as const;

export const PROJECT_FUNCTIONS = PROJECT_TOOLS;
