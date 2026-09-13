import { rateLimit } from "express-rate-limit";
import type { RequestHandler } from "express";

export function requestLimit(limit: number, windowMs = 60_000, global = false) {
  return rateLimit({
    limit,
    windowMs,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    ...(global ? { keyGenerator: () => "all" } : {}),
    message: { error: "Too many requests. Please wait and try again." },
  });
}

// Single fixed-size instance: reject excess work instead of queuing it indefinitely.
export function concurrentRequests(limit = 20): RequestHandler {
  let active = 0;
  return (_req, res, next) => {
    if (active >= limit) {
      res.setHeader("Retry-After", "5");
      res
        .status(503)
        .json({ error: "The site is busy. Please try again shortly." });
      return;
    }
    active++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        active--;
      }
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
}
