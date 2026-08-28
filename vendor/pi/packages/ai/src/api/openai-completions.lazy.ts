import type { ProviderStreams } from "../types.js";
import { lazyApi } from "./lazy.js";

// @ts-ignore: vendor lazy-api pattern uses bare .ts extension in dynamic import
export const openAICompletionsApi = (): ProviderStreams => lazyApi(() => import("./openai-completions.ts"));
