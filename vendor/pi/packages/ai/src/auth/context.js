// Variable specifier so browser bundlers do not try to resolve node builtins.
const importNodeModule = (specifier) => import(specifier);
function getProcessEnv() {
    const proc = globalThis.process;
    return proc?.env;
}
/**
 * Default auth context: env vars from `process.env` (undefined in browsers),
 * file existence via node:fs (always false in browsers).
 */
export function defaultProviderAuthContext() {
    return {
        async env(name) {
            const value = getProcessEnv()?.[name];
            return typeof value === "string" && value.trim().length > 0 ? value : undefined;
        },
        async fileExists(path) {
            try {
                const fs = (await importNodeModule("node:fs/promises"));
                let resolved = path;
                if (resolved.startsWith("~")) {
                    const os = (await importNodeModule("node:os"));
                    resolved = os.homedir() + resolved.slice(1);
                }
                await fs.access(resolved);
                return true;
            }
            catch {
                return false;
            }
        },
    };
}
//# sourceMappingURL=context.js.map