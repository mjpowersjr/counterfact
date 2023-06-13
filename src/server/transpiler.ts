// Stryker disable all

import fs from "node:fs/promises";
import nodePath from "node:path";
import { constants as fsConstants } from "node:fs";
import { once } from "node:events";

import ts from "typescript";
import chokidar from "chokidar";

async function ensureDirectoryExists(filePath: string): Promise<void> {
  const directory = nodePath.dirname(filePath);

  try {
    await fs.access(directory, fsConstants.W_OK);
  } catch {
    await fs.mkdir(directory, { recursive: true });
  }
}

export class Transpiler extends EventTarget {
  private readonly sourcePath: string;

  private readonly destinationPath: string;

  private watcher?: chokidar.FSWatcher;

  public constructor(sourcePath: string, destinationPath: string) {
    super();
    this.sourcePath = sourcePath;
    this.destinationPath = destinationPath;
  }

  public async watch(): Promise<void> {
    this.watcher = chokidar.watch(`${this.sourcePath}/**/*.{ts,mts,js,mjs}`, {
      ignored: `${this.sourcePath}/js`,
    });

    const transpiles: Promise<void>[] = [];

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.watcher.on("all", async (eventName: string, sourcePath: string) => {
      const destinationPath = sourcePath
        .replace(this.sourcePath, this.destinationPath)
        .replace(".ts", ".js");

      if (["add", "change"].includes(eventName)) {
        transpiles.push(
          this.transpileFile(eventName, sourcePath, destinationPath)
        );
      }

      if (eventName === "unlink") {
        try {
          await fs.rm(destinationPath);
        } catch (error) {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          if ((error as { code: string }).code !== "ENOENT") {
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            throw error;
          }
        }

        this.dispatchEvent(new Event("delete"));
      }
    });
    await once(this.watcher, "ready");

    await Promise.all(transpiles);
  }

  public async stopWatching(): Promise<void> {
    await this.watcher?.close();
  }

  private async transpileFile(
    eventName: string,
    sourcePath: string,
    destinationPath: string
  ): Promise<void> {
    await ensureDirectoryExists(destinationPath);

    const source = await fs.readFile(sourcePath, "utf8");

    const result: string = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022 },
    }).outputText;

    try {
      await fs.writeFile(
        nodePath.join(
          sourcePath
            .replace(this.sourcePath, this.destinationPath)
            .replace(".ts", ".mjs")
        ),

        result
      );
    } catch {
      throw new Error("could not transpile");
    }

    this.dispatchEvent(new Event("write"));
  }
}
