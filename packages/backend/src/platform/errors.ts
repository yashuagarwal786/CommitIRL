export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFound(code = "NOT_FOUND", message = "The requested resource was not found."): AppError {
  return new AppError(code, message, 404);
}

export function conflict(code: string, message: string): AppError {
  return new AppError(code, message, 409);
}

export function versionConflict(): AppError {
  return new AppError("VERSION_CONFLICT", "This record changed. Refresh and try again.", 412);
}

export function validationFailed(details?: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "The request could not be accepted.", 422, details);
}

export function unauthenticated(message = "Sign in to continue."): AppError {
  return new AppError("UNAUTHENTICATED", message, 401);
}

export function forbidden(code: string, message: string): AppError {
  return new AppError(code, message, 403);
}
