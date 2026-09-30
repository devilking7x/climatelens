// Small hardening middlewares: in-memory rate limiting + security headers.
import type { NextFunction, Request, Response } from "express";

const WINDOW_MS = 60_000;
const MAX_REQ = 60; // per IP per minute on /api/*
const buckets = new Map<string, number[]>();

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const seen = (buckets.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  seen.push(now);
  buckets.set(ip, seen);
  if (buckets.size > 5000) {
    // crude eviction to bound memory if many distinct IPs appear
    const first = buckets.keys().next().value;
    if (first !== undefined) buckets.delete(first);
  }
  if (seen.length > MAX_REQ) {
    res
      .status(429)
      .json({ ok: false, error: "too many requests — please slow down" });
    return;
  }
  next();
}

export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
}
