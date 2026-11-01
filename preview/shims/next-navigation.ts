import { back, navigate, useRouter as useRouteStore } from "../router";

export function usePathname() {
  return useRouteStore((s) => s.path);
}

export function useParams<T extends Record<string, string | undefined>>(): T {
  const path = usePathname();
  const m = path.match(/^\/chat\/([^/]+)/);
  return (m ? { chatId: m[1] } : {}) as T;
}

export function redirect(path: string): never {
  navigate(path);
  throw new Error("redirect");
}

export function notFound(): never {
  throw new Error("notFound");
}

export function useRouter() {
  return { back, push: navigate, replace: navigate, prefetch: () => {}, refresh: () => {} };
}
