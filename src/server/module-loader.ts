import { once } from "node:events";
import { type Dirent, existsSync } from "node:fs";
import fs from "node:fs/promises";
import nodePath from "node:path";
import { pathToFileURL } from "node:url";

import { type FSWatcher, watch } from "chokidar";
import createDebug from "debug";

import type { Context } from "./context-registry.js";
import { ContextRegistry } from "./context-registry.js";
import type { Module, Registry } from "./registry.js";

async function uncachedImport<ModuleType>(pathName: string) {
  const fileUrl = `${pathToFileURL(
    pathName,
  ).toString()}?cacheBust=${Date.now()}`;

  process.stdout.write(fileUrl);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, import/no-dynamic-require, no-unsanitized/method
  const aModule = await import(fileUrl);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return aModule as ModuleType;
}

const debug = createDebug("counterfact:typescript-generator:module-loader");

interface ContextModule {
  Context: Context;
}

function isContextModule(
  module: ContextModule | Module,
): module is ContextModule {
  return "Context" in module && typeof module.Context === "function";
}

function reportLoadError(error: unknown, fileUrl: string) {
  if (
    String(error) ===
    "SyntaxError: Identifier 'Context' has already been declared"
  ) {
    // Not sure why Node throws this error. It doesn't seem to matter.
    return;
  }

  process.stdout.write(`\nError loading ${fileUrl}:\n~~${String(error)}~~\n`);
}

export class ModuleLoader extends EventTarget {
  private readonly basePath: string;

  public readonly registry: Registry;

  private watcher: FSWatcher | undefined;

  private readonly contextRegistry: ContextRegistry;

  public constructor(
    basePath: string,
    registry: Registry,
    contextRegistry = new ContextRegistry(),
  ) {
    super();
    this.basePath = basePath.replaceAll("\\", "/");
    this.registry = registry;
    this.contextRegistry = contextRegistry;
  }

  public async watch(): Promise<void> {
    this.watcher = watch(`${this.basePath}/**/*.{js,mjs,ts,mts}`).on(
      "all",
      // eslint-disable-next-line max-statements
      (eventName: string, pathNameOriginal: string) => {
        const pathName = pathNameOriginal.replaceAll("\\", "/");

        if (pathName.includes("$.context") && eventName === "add") {
          process.stdout.write(
            `\n\n!!! The file at ${pathName} needs a minor update.\n    See https://github.com/pmcelhaney/counterfact/blob/main/docs/context-change.md\n\n\n`,
          );
          return;
        }

        if (!["add", "change", "unlink"].includes(eventName)) {
          return;
        }

        const parts = nodePath.parse(pathName.replace(this.basePath, ""));
        const url = `/${parts.dir}/${parts.name}`
          .replaceAll("\\", "/")
          .replaceAll(/\/+/gu, "/");

        if (eventName === "unlink") {
          this.registry.remove(url);
          this.dispatchEvent(new Event("remove"));
        }

        debug("importing module: %s", pathName);
        uncachedImport<ContextModule | Module>(pathName)
          // eslint-disable-next-line promise/prefer-await-to-then
          .then((endpoint: ContextModule | Module) => {
            this.dispatchEvent(new Event(eventName));

            if (pathName.includes("_.context")) {
              this.contextRegistry.update(
                parts.dir,

                // @ts-expect-error TS says Context has no constructable signatures but that's not true?
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/consistent-type-assertions
                new (endpoint as ContextModule).Context(),
              );
              return "context";
            }

            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            this.registry.add(url, endpoint as Module);

            return "path";
          })
          // eslint-disable-next-line promise/prefer-await-to-then
          .catch((error: unknown) => {
            reportLoadError(error, pathName);
          });
      },
    );
    await once(this.watcher, "ready");
  }

  public async stopWatching(): Promise<void> {
    await this.watcher?.close();
  }

  public async load(directory = ""): Promise<void> {
    if (
      !existsSync(nodePath.join(this.basePath, directory).replaceAll("\\", "/"))
    ) {
      throw new Error(`Directory does not exist ${this.basePath}`);
    }

    const files = await fs.readdir(
      nodePath.join(this.basePath, directory).replaceAll("\\", "/"),
      {
        withFileTypes: true,
      },
    );

    const imports = files.flatMap(async (file): Promise<void> => {
      const extension = file.name.split(".").at(-1);

      if (file.isDirectory()) {
        await this.load(
          nodePath.join(directory, file.name).replaceAll("\\", "/"),
        );

        return;
      }

      if (!["js", "mjs", "mts", "ts"].includes(extension ?? "")) {
        return;
      }

      const fullPath = nodePath
        .join(this.basePath, directory, file.name)
        .replaceAll("\\", "/");
      await this.loadEndpoint(fullPath, directory, file);
    });

    await Promise.all(imports);
  }

  // eslint-disable-next-line max-statements
  private async loadEndpoint(
    fullPath: string,
    directory: string,
    file: Dirent,
  ) {
    const fileUrl = `${pathToFileURL(
      fullPath,
    ).toString()}?cacheBust=${Date.now()}`;

    try {
      // eslint-disable-next-line import/no-dynamic-require, no-unsanitized/method, @typescript-eslint/consistent-type-assertions
      const endpoint: ContextModule | Module = (await import(fileUrl)) as
        | ContextModule
        | Module;

      if (file.name.includes("_.context")) {
        if (isContextModule(endpoint)) {
          this.contextRegistry.add(
            `/${directory.replaceAll("\\", "/")}`,

            // @ts-expect-error TS says Context has no constructable signatures but that's not true?
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            new endpoint.Context(),
          );
        }
      } else {
        const url = `/${nodePath.join(
          directory,
          nodePath.parse(file.name).name,
        )}`
          .replaceAll("\\", "/")
          .replaceAll(/\/+/gu, "/");

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        this.registry.add(url, endpoint as Module);
      }
    } catch (error: unknown) {
      if (
        String(error) ===
        "SyntaxError: Identifier 'Context' has already been declared"
      ) {
        // Not sure why Node throws this error. It doesn't seem to matter.
        return;
      }

      process.stdout.write(`\nError loading ${fileUrl}:\n${String(error)}\n`);
    }
  }
}
