import "../messages.ts";
export class SessionError extends Error {
    constructor(code, message, cause) {
        super(message, cause === undefined ? undefined : { cause });
        this.name = "SessionError";
        this.code = code;
    }
}
//# sourceMappingURL=types.js.map