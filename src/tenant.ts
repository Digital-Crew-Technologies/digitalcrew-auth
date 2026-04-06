import { organization } from "better-auth/plugins";
import type { DigitalcrewAuthEnv } from "./env.js";

/**
 * Multi-tenant boundary: each **organization** is a tenant (team / workspace).
 * Sessions can carry an **active organization** (`activeOrganizationId`) for RBAC and data scoping.
 */
export function digitalcrewOrganization(env: DigitalcrewAuthEnv) {
  return organization({
    allowUserToCreateOrganization: env.AUTH_ALLOW_USER_CREATE_ORGAN,
    ...(env.AUTH_MAX_ORGANIZATIONS_PER_USER !== undefined
      ? { organizationLimit: env.AUTH_MAX_ORGANIZATIONS_PER_USER }
      : {}),
    membershipLimit: env.AUTH_MAX_MEMBERS_PER_ORGAN ?? 100,
  });
}
