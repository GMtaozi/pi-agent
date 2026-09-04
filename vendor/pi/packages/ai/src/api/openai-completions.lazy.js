import { lazyApi } from "./lazy.js";
// @ts-ignore: vendor lazy-api pattern uses bare .ts extension in dynamic import
export const openAICompletionsApi = () => lazyApi(() => import("./openai-completions.ts"));
//# sourceMappingURL=openai-completions.lazy.js.map