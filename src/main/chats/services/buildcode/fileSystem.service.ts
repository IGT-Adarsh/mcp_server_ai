// src/services/fileSystemManager.ts
import fs from "fs/promises";
import path from "path";

export type FileOperation = {
  path: string; // relative to project root
  action: "create" | "update" | "delete";
  content?: string; // required for create/update
};

export type FileOperationResult = {
  path: string;
  action: "create" | "update" | "delete";
  status: "applied" | "skipped" | "failed";
  message?: string;
  backupPath?: string | null; // path to backup if created
};

export type ApplyOptions = {
  dryRun?: boolean; // do not perform fs changes
  backup?: boolean; // backup original files before update/delete
  rollbackOnError?: boolean; // revert applied changes if an operation fails
  projectRoot?: string; // default process.cwd()
};

export class FileSystemManager {
  private projectRoot: string;
  constructor(projectRoot?: string) {
    this.projectRoot = path.resolve(projectRoot ?? process.cwd());
  }

  private resolveSafe(p: string) {
    const candidate = path.resolve(this.projectRoot, p);
    const rel = path.relative(this.projectRoot, candidate);
    // if rel starts with '..' or is absolute, it's outside projectRoot
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
      return candidate;
    }
    throw new Error(`Path escapes project root: ${p}`);
  }
  private async ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
  }

  private async writeAtomic(target: string, content: string) {
    const dir = path.dirname(target);
    await this.ensureDir(dir);
    const tmp = `${target}.${Date.now()}.${Math.random()
      .toString(36)
      .slice(2, 8)}.tmp`;
    await fs.writeFile(tmp, content, "utf8");
    await fs.rename(tmp, target);
  }

  // backup original file to backupDir and return backup path
  private async backupFile(originalPath: string, backupDir: string) {
    await this.ensureDir(backupDir); // ensure backup directory exists
    const rel = path
      .relative(this.projectRoot, originalPath)
      .replace(/[/\\]/g, "_");
    const backupPath = path.join(backupDir, `${rel}.${Date.now()}.bak`);
    await this.ensureDir(path.dirname(backupPath));
    await fs.copyFile(originalPath, backupPath);
    return backupPath;
  }
  /**
   * Apply a sequence of file operations in order.
   * On error, if rollbackOnError is true, attempts to revert changes.
   */
  public async applyOperations(
    operations: FileOperation[],
    opts: ApplyOptions = {}
  ): Promise<{ results: FileOperationResult[]; backupFolder?: string | null }> {
    const { dryRun = false, backup = true, rollbackOnError = true } = opts;
    const backupFolder = backup
      ? path.join(this.projectRoot, `.mcp_backups`, `${Date.now()}`)
      : null;
    if (backup && backupFolder) await this.ensureDir(backupFolder);

    const appliedStack: Array<{ op: FileOperation; meta?: any }> = [];
    const results: FileOperationResult[] = [];

    for (const op of operations) {
      try {
        // basic validation
        if (
          !op ||
          typeof op.path !== "string" ||
          !["create", "update", "delete"].includes(op.action)
        ) {
          results.push({
            path: op?.path ?? "<unknown>",
            action: op?.action ?? ("create" as any),
            status: "failed",
            message: `Invalid operation shape`,
          });
          if (rollbackOnError) await this.rollback(appliedStack, backupFolder);
          return { results, backupFolder };
        }

        const fullPath = this.resolveSafe(op.path);

        // create
        if (op.action === "create") {
          // if file exists -> skip (or treat as update if you want)
          let exists = false;
          try {
            await fs.access(fullPath);
            exists = true;
          } catch {
            exists = false;
          }

          if (exists) {
            // skip create if file already exists
            results.push({
              path: op.path,
              action: "create",
              status: "skipped",
              message: "File already exists",
            });
            continue;
          }

          if (dryRun) {
            results.push({
              path: op.path,
              action: "create",
              status: "applied",
              message: "dry-run (no write)",
            });
            // push to appliedStack so rollback can remove if needed (but dry-run => nothing to remove)
            appliedStack.push({ op, meta: { created: false } });
            continue;
          }

          // write file atomically
          await this.writeAtomic(fullPath, op.content ?? "");
          results.push({ path: op.path, action: "create", status: "applied" });
          appliedStack.push({ op, meta: { created: true } });
        }

        // update
        else if (op.action === "update") {
          let exists = true;
          try {
            await fs.access(fullPath);
          } catch {
            exists = false;
          }

          // if not exists, treat as create (optionally)
          if (!exists) {
            if (dryRun) {
              results.push({
                path: op.path,
                action: "update",
                status: "applied",
                message: "dry-run (create)",
              });
              appliedStack.push({
                op,
                meta: { created: false, updated: true },
              });
            } else {
              await this.writeAtomic(fullPath, op.content ?? "");
              results.push({
                path: op.path,
                action: "update",
                status: "applied",
                message: "file created (was missing)",
              });
              appliedStack.push({ op, meta: { created: true } });
            }
            continue;
          }

          // check if update is actually needed (compare content)
          if (!dryRun) {
            const current = await fs.readFile(fullPath, "utf8");
            if (current === (op.content ?? "")) {
              results.push({
                path: op.path,
                action: "update",
                status: "skipped",
                message: "content identical",
              });
              continue;
            }
          } else {
            // for dry run, we can't compare; assume update would be applied
          }

          // backup old file
          const backupPath = backup
            ? await this.backupFile(fullPath, backupFolder!)
            : null;

          if (dryRun) {
            results.push({
              path: op.path,
              action: "update",
              status: "applied",
              message: "dry-run (backup simulated)",
              backupPath,
            });
            appliedStack.push({ op, meta: { backupPath, updated: false } });
          } else {
            // atomic write
            await this.writeAtomic(fullPath, op.content ?? "");
            results.push({
              path: op.path,
              action: "update",
              status: "applied",
              backupPath,
            });
            appliedStack.push({ op, meta: { backupPath, updated: true } });
          }
        }

        // delete
        else if (op.action === "delete") {
          let exists = true;
          try {
            await fs.access(fullPath);
          } catch {
            exists = false;
          }

          if (!exists) {
            results.push({
              path: op.path,
              action: "delete",
              status: "skipped",
              message: "file not found",
            });
            continue;
          }

          const backupPath = backup
            ? await this.backupFile(fullPath, backupFolder!)
            : null;

          if (dryRun) {
            results.push({
              path: op.path,
              action: "delete",
              status: "applied",
              message: "dry-run (no delete)",
              backupPath,
            });
            appliedStack.push({ op, meta: { backupPath, deleted: false } });
          } else {
            // remove file (force)
            await fs.rm(fullPath, { force: true });
            results.push({
              path: op.path,
              action: "delete",
              status: "applied",
              backupPath,
            });
            appliedStack.push({ op, meta: { backupPath, deleted: true } });
          }
        }
      } catch (err: any) {
        const message = err?.message ?? String(err);
        results.push({
          path: op?.path ?? "<unknown>",
          action: op?.action ?? ("create" as any),
          status: "failed",
          message,
        });
        // attempt rollback if requested
        if (rollbackOnError) {
          try {
            await this.rollback(appliedStack, backupFolder);
          } catch (rbErr) {
            results.push({
              path: "<rollback>",
              action: "delete",
              status: "failed",
              message: `Rollback failed: ${(rbErr as Error).message}`,
            });
          }
        }
        return { results, backupFolder };
      }
    }

    // success
    return { results, backupFolder };
  }

  // Revert changes using appliedStack and backups
  private async rollback(
    appliedStack: Array<{ op: FileOperation; meta?: any }>,
    backupFolder?: string | null
  ) {
    if (!appliedStack || appliedStack.length === 0) return;
    // reverse order
    for (let i = appliedStack.length - 1; i >= 0; i--) {
      const { op, meta } = appliedStack[i];
      try {
        const fullPath = this.resolveSafe(op.path);
        // If we created a file, remove it
        if (meta?.created) {
          await fs.rm(fullPath, { force: true });
        }
        // If we updated a file, restore from backupPath
        if (meta?.backupPath) {
          const b = meta.backupPath;
          // If backup exists, copy back
          try {
            await fs.access(b);
            await this.ensureDir(path.dirname(fullPath));
            await fs.copyFile(b, fullPath);
          } catch {
            // ignore missing backups
          }
        }
        // If we deleted a file (we backed it up), restore
        if (meta?.deleted && meta?.backupPath) {
          const b = meta.backupPath;
          try {
            await fs.access(b);
            await this.ensureDir(path.dirname(fullPath));
            await fs.copyFile(b, fullPath);
          } catch {
            // ignore
          }
        }
      } catch {
        // continue best-effort
      }
    }
    // do not remove backup folder on rollback — useful for inspection
  }
}
