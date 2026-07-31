import Bottleneck from "bottleneck";
import { defineProvider } from "./rate-limit.js";

export const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 20,
});

export const spec = defineProvider({
  id: "brave",
  limiter,
});
