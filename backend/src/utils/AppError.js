/**
 * Error type carrying an HTTP status code. Anything thrown as AppError is
 * returned to the API client with `status` and `message`; all other errors are
 * reported as 500 with a generic message (details only in server logs).
 */
export class AppError extends Error {
  constructor(message, status = 400, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

export default AppError;
