import { NextFunction, Response, Request } from "express";
import * as path from "path";
import CodeBuilderService from "../services/buildcode/buildcode.service";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { callModelWithToolsStream } from "utils/aiClient";
import {
  FileOperation,
  FileSystemManager,
} from "../services/buildcode/fileSystem.service";

class BuilderCodeEmitterController {
  public buildingProject = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { userPrompt, socketId } = req.body;
      // Validate input`

      const projectRoot = path.resolve(__dirname, "../../../../script");
      // const projectRoot = process.cwd();
      const existing = CodeBuilderService.snapshotDir(projectRoot);

      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: [
            "You are an AI Project Architect and Advanced Code Generator.",
            "Your workflow must follow these steps:",
            "1. FIRST: Build a clear and modular **folder and file structure** for the project based on the user prompt and chosen tech stack.",
            "2. SECOND: Generate all reusable modules, classes, and utility functions in separate files within this structure.",
            "3. THIRD: Generate feature-specific modules (e.g., controllers, services, APIs) in their respective folders.",
            "4. FOURTH: Include dependencies and stack-specific configuration (package.json, requirements.txt, Cargo.toml, etc.) as needed.",
            "",
            "You MUST CALL the function `build_module_tree_from_prompt` with a single JSON argument object.",
            "That object MUST include a property `moduleTree` containing the root ModuleNode (recursive).",
            "ModuleNode shape: { id: string (safeId), name: string, description?: string, files?: string[], children?: ModuleNode[] }.",
            "Do NOT produce any plain-text explanation. Only return the function call with valid JSON arguments.",
            "If the prompt is empty, still return a minimal moduleTree: { id: 'root', name: 'Root', children: [] }. ",
            "Use the existing project snapshot to avoid duplicating paths or files.",
            "",
            "Include subfolders for backend, frontend, shared utilities, tests, and configuration files where applicable.",
            "For frontend, include React/Next.js or any stack specified, with components, hooks, services, and pages separated.",
            "For backend, include controllers, services, schemas, routes, utilities, and dependency files separately.",
            "Include optional language-specific files if requested (TypeScript, Python, Rust, Go, etc.).",
            "Include dependency management files (package.json, requirements.txt, Pipfile, Cargo.toml, go.mod, etc.) based on the chosen stack.",
            "Your output should reflect advanced modular design, with clear separation of concerns, reusable modules, and dependency awareness.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            "Task (user intent):",
            userPrompt,
            "",
            "Return only the function call with arguments (see system message).",
          ].join("\n"),
        },
        {
          role: "assistant",
          content: [
            "Existing project snapshot (paths + short content previews):",
            JSON.stringify(
              existing.map((f) => ({
                path: f.path,
                content: f.content || "",
              })),
              null,
              2
            ),
            "",
            "Use this snapshot to avoid duplicating files and integrate with existing modules.",
            "Include all proposed folders, modules, files, and dependency-related files in the tree.",
          ].join("\n"),
        },
      ];

      const maxAttempts = 1;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { toolCallName, toolCallArgsBuffer: toolCallArgsBufferTree } =
          await callModelWithToolsStream(messages, 32768);

        if (toolCallName === "build_module_tree_from_prompt") {
          const messages1: ChatCompletionMessageParam[] = [
            {
              role: "system",
              content: [
                "You are an AI Code Generator.",
                "You MUST CALL the function `emitFiles` and return a single JSON argument object with an `operations` array.",
                "Each operation must include `path` (relative path), `action` ('create'|'update'|'delete'), and `content` for create/update.",
                "Do NOT return plain-text explanation — only call `emitFiles` with valid JSON arguments.",
                'If no files need changes based on the module tree and snapshot, return `{ "operations": [] }`.',
              ].join(" "),
            },
            {
              role: "user",
              content: [
                "Task: generate filesystem operations from the provided module tree.",
                "",
                "Module tree (JSON):",
                toolCallArgsBufferTree,
                "",
                "Existing snapshot (paths + short previews):",
                JSON.stringify(
                  existing.map((f) => ({
                    path: f.path,
                    content: f.content || "",
                  })),
                  null,
                  2
                ),
                "",
                "Rules:",
                "- For new files, use action `create` and include full file content.",
                "- For files that must be changed, use `update` and include the new full content.",
                "- For deletions, use `delete` and omit `content` or set it to an empty string.",
                "- Prefer small, focused files (one responsibility per file).",
                "- Include any necessary imports and basic scaffolding (exports, class/function declarations).",
                "",
                "Return only the function call `emitFiles` with valid JSON arguments.",
              ].join("\n"),
            },
            {
              role: "assistant",
              content:
                "Use the module tree and snapshot to decide which files to create/update/delete. Return only the function call.",
            },
          ];

          const { toolCallName, toolCallArgsBuffer } =
            await callModelWithToolsStream(messages1, 32768);

          if (!toolCallArgsBuffer || !toolCallName)
            throw new Error("No response from model");
          if (toolCallName === "emitFiles") {
            const operations: {
              operations: FileOperation[];
            } = JSON.parse(toolCallArgsBuffer);
            const manager = new FileSystemManager(projectRoot);
            const operationsData = operations.operations as FileOperation[];
            const { results, backupFolder } = await manager.applyOperations(
              operationsData,
              {
                dryRun: false,
                backup: true,
                rollbackOnError: true,
                projectRoot: projectRoot,
              }
            );
            console.log("Results:", results);
            console.log("Backups stored at:", backupFolder);

            const messagesRunCmd: ChatCompletionMessageParam[] = [
              {
                role: "system",
                content: [
                  "You are an expert DevOps-aware AI Assistant that chooses the single best CLI command to satisfy a developer's request.",
                  "You MUST return exactly one structured function call to `run_cmd` with JSON arguments only (no additional text).",
                  "The JSON MUST match this shape:",
                  "{",
                  "  projectId: string,",
                  "  cmd: string, // short human-friendly description",
                  "  command: string, // executable (e.g. 'pnpm','npm','npx','node')",
                  "  args: string[], // argument array (no shell concatenation)",
                  "  options?: { cwd?: string, env?: Record<string,string>, shell?: boolean, suggestions?: Array<{cmd:string,reason:string}> }",
                  "}",
                  "",
                  "Decision rules (follow in priority order):",
                  "1) Detect preferred package manager by presence of lockfiles: pnpm-lock.yaml -> pnpm, yarn.lock -> yarn, package-lock.json -> npm. If none, prefer npm.",
                  "2) If package.json contains a matching script (e.g. 'dev','start','build','test','typecheck'), prefer invoking the script via the chosen package manager: e.g. ['run','dev'] for npm/pnpm/yarn.",
                  "3) Use cwd to point to the correct subproject if the repo is monorepo-style (detect 'package.json' location under subfolders).",
                  "4) Prefer safe, deterministic flags for CI/builds (e.g. '--frozen-lockfile' for pnpm/yarn/npm where appropriate) and fast dev flags for local dev (e.g. '--watch' only when asked).",
                  "5) If multiple commands match the goal, choose the least-destructive option (typecheck or run tests) and include others as structured `options.suggestions` (not text).",
                  "6) Do NOT include secret values in `env`. Use '<REDACTED>' placeholders when a value is needed but not provided.",
                  "",
                  "Fallback rules (apply if you cannot confidently pick a single best command):",
                  "- If ambiguous, return a TypeScript typecheck: { command: chosenPackageManagerOrNpx, args: ['tsc','--noEmit'] }",
                  "- If project is JS-only and has no test/build scripts, return: { command: chosenPackageManager, args: ['run','start'] } if start script exists; else a safe `node` or `npx` invocation.",
                  "",
                  "Strict output rules:",
                  "- Do NOT return any plain language explanation in assistant content — only the function call must be used to return the JSON arguments.",
                  "- `args` must be an array of individual arguments (no combined shell string).",
                  "- `options.shell` should be true only if the command requires shell features; prefer `false` for portability.",
                  "- Include `options.suggestions` (array of {cmd, reason}) if there are helpful alternative commands.",
                  "- For long-running dev servers include `options.env` placeholders (e.g., PORT) if useful.",
                ].join(" "),
              },
              {
                role: "user",
                content: [
                  "User request:",
                  userPrompt,
                  "",
                  "Use the project snapshot and package.json(s) to decide the best command.",
                  "If you need to assume the environment, use conservative defaults (NODE_ENV=development for dev, NODE_ENV=production for build).",
                ].join("\n"),
              },
              {
                role: "assistant",
                content: [
                  "Project snapshot (paths + short content previews):",
                  JSON.stringify(
                    existing.map((f) => ({
                      path: f.path,
                      // include package.json content fully when present so model can pick scripts
                      content: /package\.json$/i.test(f.path)
                        ? f.content || ""
                        : f.content?.slice(0, 200) || "",
                    })),
                    null,
                    2
                  ),
                ].join("\n"),
              },
            ];
            const {
              fullMessage,
              toolCallName,
              toolCallArgsBuffer: toolCallArgs,
            } = await callModelWithToolsStream(messagesRunCmd, 32768);

            const runCmd = JSON.parse(toolCallArgs);

            const result = await CodeBuilderService.runCommand(
              runCmd.command,
              runCmd.args,
              {
                cwd: projectRoot,
                env: {
                  ...process.env,
                  ...(runCmd.options?.env ?? {}),
                },
                shell: runCmd.options?.shell ?? false,
              }
            );

            messages1
              .filter((m) => m.role !== "user")
              .forEach((m) => {
                messages1.push({
                  role: "user",
                  content: JSON.stringify(result),
                });
              });

            const {
              fullMessage: fullMessageCMD,
              toolCallName: toolCallNameCMD,
              toolCallArgsBuffer: toolCallArgsBufferCMD,
            } = await callModelWithToolsStream(messages1, 32768);

            console.log("Result:", result, messages1);

            if (maxAttempts === attempt) {
              res.json({ ok: true, results, backupFolder });
            }
          }
        }
      }
    } catch (err) {
      next(err);
    }
  };
}
export default new BuilderCodeEmitterController();
