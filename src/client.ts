import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";

export function createDigitalcrewAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [organizationClient()],
  });
}
