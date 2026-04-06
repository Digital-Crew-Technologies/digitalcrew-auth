/**
 * Mount Better Auth on frameworks that expose Web `Request` / `Response` (Next.js App Router, etc.).
 *
 * @example
 * ```ts
 * // app/api/auth/[...all]/route.ts
 * import { getAuth } from "@digitalcrew/auth";
 * import { routeHandlers } from "@digitalcrew/auth/http";
 * const auth = getAuth();
 * export const { GET, POST } = routeHandlers(auth);
 * ```
 */
export function routeHandlers(auth: {
  handler: (request: Request) => Promise<Response>;
}) {
  const handle = (request: Request) => auth.handler(request);
  return { GET: handle, POST: handle };
}
