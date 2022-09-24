import { once } from "node:events";

import { ModuleLoader } from "../src/module-loader.js";
import { Registry } from "../src/registry.js";
import { ModelRegistry } from "../src/model-registry.js";

import { withTemporaryFiles } from "./lib/with-temporary-files.js";

describe("a module loader", () => {
  it("finds a file and adds it to the registry", async () => {
    const files = {
      "hello.mjs": `
      export function GET() {
          return {
              body: "hello"
          };
      }
      `,
      "a/b/c.mjs": `
        export function GET() {
            return {
                body: "GET from a/b/c"
            }; 
        }
      `,
    };

    await withTemporaryFiles(files, async (basePath) => {
      const registry = new Registry();
      const loader = new ModuleLoader(basePath, registry);

      await loader.load();

      expect(registry.exists("GET", "/hello")).toBe(true);
      expect(registry.exists("POST", "/hello")).toBe(false);
      expect(registry.exists("GET", "/goodbye")).toBe(false);
      expect(registry.exists("GET", "/a/b/c")).toBe(true);
    });
  });

  it("updates the registry when a file is added", async () => {
    await withTemporaryFiles({}, async (basePath, { add }) => {
      const registry = new Registry();
      const loader = new ModuleLoader(basePath, registry);

      await loader.load();
      await loader.watch();

      expect(registry.exists("GET", "/late/addition")).toBe(false);

      add(
        "late/addition.mjs",
        'export function GET() { return { body: "I\'m here now!" }; }'
      );
      await once(loader, "add");

      expect(registry.exists("GET", "/late/addition")).toBe(true);

      await loader.stopWatching();
    });
  });

  it("updates the registry when a file is deleted", async () => {
    await withTemporaryFiles(
      {
        "delete-me.mjs":
          'export function GET() { return { body: "Goodbye" }; }',
      },
      async (basePath, { remove }) => {
        const registry = new Registry();
        const loader = new ModuleLoader(basePath, registry);

        await loader.load();
        await loader.watch();

        expect(registry.exists("GET", "/delete-me")).toBe(true);

        remove("delete-me.mjs");
        await once(loader, "remove");

        expect(registry.exists("GET", "/delete-me")).toBe(false);

        await loader.stopWatching();
      }
    );
  });

  it("ignores files with the wrong file extension", async () => {
    const contents = 'export function GET() { return { body: "hello" }; }';

    const files = {
      "module.mjs": contents,
      "README.md": contents,
      "#types.mjs": contents,
    };

    await withTemporaryFiles(files, async (basePath, { add }) => {
      const registry = new Registry();
      const loader = new ModuleLoader(basePath, registry);

      await loader.load();
      await loader.watch();

      await add("other.txt", "should not be loaded");
      await add("#other.mjs", "should not be loaded");

      expect(registry.exists("GET", "/module")).toBe(true);
      expect(registry.exists("GET", "/READMEx")).toBe(false);
      expect(registry.exists("GET", "/other")).toBe(false);
      expect(registry.exists("GET", "/types")).toBe(false);

      await loader.stopWatching();
    });
  });

  // This should work but I can't figure out how to break the
  // module cache when running through Jest (which uses the
  // experimental module API).

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip("updates the registry when a file is changed", async () => {
    await withTemporaryFiles(
      {
        "change.mjs":
          'export function GET() { return { body: "before change" }; }',
      },
      async (basePath, { add }) => {
        const registry = new Registry();
        const loader = new ModuleLoader(basePath, registry);

        await loader.watch();
        add(
          "change.mjs",
          'export function GET() { return { body: "after change" }; }'
        );
        await once(loader, "change");

        const response = await registry.endpoint(
          "GET",
          "/change"
        )({ path: "", reduce: () => undefined, context: {} });

        expect(response.body).toBe("after change");
        expect(registry.exists("GET", "/late/addition")).toBe(true);

        await loader.stopWatching();
      }
    );
  });

  it("finds a model and adds it to the model registry", async () => {
    const files = {
      "#model.mjs": `
      export default "main";
      `,
      "hello/#model.mjs": `
      export default "hello-world"; 
      `,
    };

    await withTemporaryFiles(files, async (basePath) => {
      const registry = new Registry();

      const modelRegistry = new ModelRegistry();

      const loader = new ModuleLoader(basePath, registry, modelRegistry);

      await loader.load();

      expect(modelRegistry.find("/hello")).toBe("hello-world");
      expect(modelRegistry.find("/hello/world")).toBe("hello-world");
      expect(modelRegistry.find("/some/other/path")).toBe("main");
    });
  });
});
