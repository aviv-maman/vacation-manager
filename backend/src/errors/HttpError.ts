export class HttpError extends Error {
  constructor(
    public readonly statusCode: 400 | 401 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
