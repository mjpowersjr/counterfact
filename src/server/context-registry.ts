// eslint-disable-next-line max-classes-per-file
export class Context {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor, @typescript-eslint/no-empty-function
  public constructor() {}

  [key: string]: unknown;
}

export function parentPath(path: string): string {
  return String(path.split("/").slice(0, -1).join("/")) || "/";
}

export class ContextRegistry {
  private readonly entries = new Map<string, Context>();

  private readonly cache = new Map<string, Context>();

  private readonly seen = new Set<string>();

  public constructor() {
    this.add("/", {});
  }

  public add(path: string, context: Context): void {
    this.entries.set(path, context);
    this.cache.set(path, structuredClone(context));
  }

  public find(path: string): Context {
    return this.entries.get(path) ?? this.find(parentPath(path));
  }

  // eslint-disable-next-line max-statements
  public update(path: string, updatedContext?: Context): void {
    if (updatedContext === undefined) {
      return;
    }

    if (!this.seen.has(path)) {
      this.seen.add(path);
      this.add(path, updatedContext);
      return;
    }

    const context = this.find(path);

    for (const property in updatedContext) {
      if (updatedContext[property] !== this.cache.get(path)?.[property]) {
        context[property] = updatedContext[property];
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    Object.setPrototypeOf(context, Object.getPrototypeOf(updatedContext));

    this.cache.set(path, structuredClone(updatedContext));
  }
}
