/** Base class for domain errors that carry their own HTTP status code. The
 *  API layer checks `instanceof DomainError` and uses `err.status` for the
 *  response, so error status mapping stays with the domain rule that raises
 *  it rather than being scattered as string matching in the controller. */
export class DomainError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);

    this.status = status;
  }
}

/** Input validation error (invalid format, out-of-range, wrong type).
 *  Maps to 400 Bad Request. */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 400);
  }
}

/** Authentication failure (bad credentials, invalid token). Maps to 401
 *  Unauthorized. */
export class UnauthorizedError extends DomainError {
  constructor(message: string) {
    super(message, 401);
  }
}

/** Domain state conflict (duplicate, already-set-up). Maps to 409 Conflict. */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409);
  }
}

/** Authorization failure (authenticated but not allowed to access/modify
 *  the resource). Maps to 403 Forbidden. */
export class ForbiddenError extends DomainError {
  constructor(message: string) {
    super(message, 403);
  }
}
