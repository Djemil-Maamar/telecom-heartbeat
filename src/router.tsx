import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    // offlineFirst + long gcTime keep site cards and work orders readable on the field without network.
    defaultOptions: { queries: { networkMode: "offlineFirst", gcTime: 7 * 24 * 3600_000, staleTime: 10_000, retry: 1 } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
