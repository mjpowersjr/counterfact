import type { Registry } from "./registry";
import type { CounterfactResponse } from "./counterfact-response";
import type { CounterfactRequest } from "./counterfact-request";

export class Dispatcher {
  private readonly registry: Registry;

  public constructor(registry: Readonly<Registry>) {
    this.registry = registry;
  }

  public async request({
    method,
    path,
  }: Readonly<CounterfactRequest>): Promise<CounterfactResponse> {
    const parts = path.split("/");

    let remainingParts = parts.length;
    let currentPath = "";

    while (remainingParts > 0) {
      currentPath = parts.slice(0, remainingParts).join("/");

      if (this.registry.exists(method, currentPath)) {
        break;
      }

      remainingParts -= 1;
    }

    if (remainingParts === 0) {
      return {
        body: `${method} method for endpoint at "${path}" does not exist`,
      };
    }

    return await this.registry.endpoint(
      method,
      currentPath
    )({
      path: parts.slice(remainingParts).join("/"),
    });
  }
}
