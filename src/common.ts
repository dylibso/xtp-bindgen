export class ValidationError {
  constructor(public message: string, public path: string) {
    this.message = message
    this.path = path
  }
}
