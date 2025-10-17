import { FileSnapshot } from "main/chats/chat.types";
import { readdirSync, statSync, readFileSync, Stats } from "fs";
import path from "path";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "fs";
// In your AppService
import { Observable } from "rxjs";
export type RunCmdOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
};

export type RunCmdResult = {
  success: boolean;
  exitCode?: number;
  stdout: string;
  stderr: string;
  errorStack?: string;
};
class CodeBuilderService {
  public snapshotDir(
    dir: string,
    prefix = "",
    ignore = ["node_modules", ".git", "dist"],
    maxFileSize = 10000 * 1024,
    maxContent = 100000
  ): FileSnapshot[] {
    const files: FileSnapshot[] = [];
    let entries: string[];

    try {
      entries = readdirSync(dir);
    } catch {
      return files;
    }

    for (const name of entries) {
      if (ignore.includes(name)) continue;
      const full = path.join(dir, name);
      const rel = path.join(prefix, name);
      let stats: Stats;

      try {
        stats = statSync(full);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        // NOTE the `this.` prefix here
        files.push(
          ...this.snapshotDir(full, rel, ignore, maxFileSize, maxContent)
        );
      } else if (stats.size <= maxFileSize) {
        let content = readFileSync(full, "utf8");
        if (content.length > maxContent) {
          content = content.slice(0, maxContent) + "\n/* ...truncated... */";
        }
        files.push({ path: rel, content });
      }
    }
    return files;
  }

  public async runCommand(
    command: string,
    args: string[] = [],
    options: RunCmdOptions = {}
  ): Promise<RunCmdResult> {
    return new Promise((resolve) => {
      const cwd = options.cwd ?? process.cwd();
      const shell = options.shell ?? true; // shell mode for commands like "npm install"

      const child = spawn(command, args, { cwd, shell, env: options.env });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (err) => {
        resolve({
          success: false,
          stdout,
          stderr,
          errorStack: err.stack,
        });
      });

      child.on("close", (code) => {
        resolve({
          success: code === 0,
          exitCode: code ?? undefined,
          stdout,
          stderr,
          errorStack: code !== 0 ? stderr || stdout : undefined,
        });
      });
    });
  }
}

export default new CodeBuilderService();

// const maxAttemptsRun = 3;
// for (let attempt = 1; attempt <= maxAttemptsRun; attempt++) {
//   const messagesRunCmd: ChatCompletionMessageParam[] = [
//     {
//       role: "system",
//       content: [
//         "You are an expert DevOps-aware AI Assistant that chooses the single best CLI command to satisfy a developer's request.",
//         "You MUST return exactly one structured function call to `run_cmd` with JSON arguments only (no additional text).",
//         "The JSON MUST match this shape:",
//         "{",
//         "  projectId: string,",
//         "  cmd: string, // short human-friendly description",
//         "  command: string, // executable (e.g. 'pnpm','npm','npx','node')",
//         "  args: string[], // argument array (no shell concatenation)",
//         "  options?: { cwd?: string, env?: Record<string,string>, shell?: boolean, suggestions?: Array<{cmd:string,reason:string}> }",
//         "}",
//         "",
//         "Decision rules (follow in priority order):",
//         "1) Detect preferred package manager by presence of lockfiles: pnpm-lock.yaml -> pnpm, yarn.lock -> yarn, package-lock.json -> npm. If none, prefer npm.",
//         "2) If package.json contains a matching script (e.g. 'dev','start','build','test','typecheck'), prefer invoking the script via the chosen package manager: e.g. ['run','dev'] for npm/pnpm/yarn.",
//         "3) Use cwd to point to the correct subproject if the repo is monorepo-style (detect 'package.json' location under subfolders).",
//         "4) Prefer safe, deterministic flags for CI/builds (e.g. '--frozen-lockfile' for pnpm/yarn/npm where appropriate) and fast dev flags for local dev (e.g. '--watch' only when asked).",
//         "5) If multiple commands match the goal, choose the least-destructive option (typecheck or run tests) and include others as structured `options.suggestions` (not text).",
//         "6) Do NOT include secret values in `env`. Use '<REDACTED>' placeholders when a value is needed but not provided.",
//         "",
//         "Fallback rules (apply if you cannot confidently pick a single best command):",
//         "- If ambiguous, return a TypeScript typecheck: { command: chosenPackageManagerOrNpx, args: ['tsc','--noEmit'] }",
//         "- If project is JS-only and has no test/build scripts, return: { command: chosenPackageManager, args: ['run','start'] } if start script exists; else a safe `node` or `npx` invocation.",
//         "",
//         "Strict output rules:",
//         "- Do NOT return any plain language explanation in assistant content — only the function call must be used to return the JSON arguments.",
//         "- `args` must be an array of individual arguments (no combined shell string).",
//         "- `options.shell` should be true only if the command requires shell features; prefer `false` for portability.",
//         "- Include `options.suggestions` (array of {cmd, reason}) if there are helpful alternative commands.",
//         "- For long-running dev servers include `options.env` placeholders (e.g., PORT) if useful.",
//       ].join(" "),
//     },
//     {
//       role: "user",
//       content: [
//         "User request:",
//         userPrompt,
//         "",
//         "Use the project snapshot and package.json(s) to decide the best command.",
//         "If you need to assume the environment, use conservative defaults (NODE_ENV=development for dev, NODE_ENV=production for build).",
//       ].join("\n"),
//     },
//     {
//       role: "assistant",
//       content: [
//         "Project snapshot (paths + short content previews):",
//         JSON.stringify(
//           existing.map((f) => ({
//             path: f.path,
//             // include package.json content fully when present so model can pick scripts
//             content: /package\.json$/i.test(f.path)
//               ? f.content || ""
//               : f.content?.slice(0, 200) || "",
//           })),
//           null,
//           2
//         ),
//       ].join("\n"),
//     },
//   ];

//   const options = {
//     cwd: projectRoot,
//   };

//   const { fullMessage, toolCallName, toolCallArgsBuffer } =
//     await callModelWithToolsStream(messagesRunCmd, 32768);
//   const runCmd = JSON.parse(toolCallArgsBuffer);
//   const reverStream = CodeBuilderService.runCommandStream(
//     runCmd.command,
//     runCmd.args,
//     options
//   );

//   console.log("Tool call:", JSON.stringify(reverStream));
//   res.json({ ok: true, reverStream, runCmd });
// }
