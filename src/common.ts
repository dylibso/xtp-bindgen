export class ValidationError {
  constructor(public message: string, public path: string) {
    this.message = message
    this.path = path
  }
}

declare global {
  interface Array<T> {
    none(predicate: (item: T) => boolean): boolean;
  }
}

if (!Array.prototype.none) {
  Array.prototype.none = function<T>(predicate: (item: T) => boolean): boolean {
    return !this.some(predicate);
  }
}
