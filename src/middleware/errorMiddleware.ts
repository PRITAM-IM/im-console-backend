import { NextFunction, Request, Response } from 'express';

type ErrorWithStatus = Error & { statusCode?: number };

export const errorHandler = (
  err: ErrorWithStatus,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = res.statusCode && res.statusCode >= 400 ? res.statusCode : (err.statusCode || 500);

  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
  });
};

