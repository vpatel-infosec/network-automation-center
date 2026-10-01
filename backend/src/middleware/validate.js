import AppError from '../utils/AppError.js';

/** Wrap async route handlers so rejected promises reach the error handler. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Validate and coerce req.body with a zod schema. */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const details = result.error.issues.map(
        (issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`
      );
      return next(new AppError(`Validation failed: ${details.join('; ')}`, 400, details));
    }
    req.body = result.data;
    return next();
  };
}

export default { asyncHandler, validateBody };
