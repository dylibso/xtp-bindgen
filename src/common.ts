export class ValidationError extends Error {
    constructor(public message: string, public path: string) {
        super(message);
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}
