export function getEndpoint(route: string): URL {
  return new URL(route, process.env.SIM_API_BASE_URL);
}

export function getRequiredHeaders(): HeadersInit {
  return {
    "X-Sim-Api-Key": process.env.SIM_API_KEY!,
  };
}
