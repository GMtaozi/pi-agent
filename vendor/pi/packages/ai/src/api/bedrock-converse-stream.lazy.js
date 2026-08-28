import { lazyApi } from "./lazy.js";
/**
 * Loads the bedrock implementation through a variable specifier so bundlers
 * (browser smoke, Bun compile) cannot follow the import into the Node-only
 * AWS SDK. The `.ts`/`.js` rewrite keeps the trick working from both source
 * and built output.
 */
const importNodeOnlyApi = (specifier) => {
    const runtimeSpecifier = import.meta.url.endsWith(".js") ? specifier.replace(/\.ts$/, ".js") : specifier;
    return import(runtimeSpecifier);
};
let bedrockModuleOverride;
/**
 * Overrides the dynamically imported bedrock implementation. Used by the Bun
 * binary build, where the variable-specifier import cannot be bundled; the
 * build registers a statically imported module instead.
 */
export function setBedrockProviderModule(module) {
    bedrockModuleOverride = module;
}
export const bedrockConverseStreamApi = () => lazyApi(async () => bedrockModuleOverride ?? (await importNodeOnlyApi("./bedrock-converse-stream.ts")));
