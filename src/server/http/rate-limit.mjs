// In-memory fixed-window limiter. Good for one server process; a multi-instance
// deployment needs a shared store instead.
export function createRateLimiter({limit, windowMs, now = Date.now}) {
  const buckets = new Map();
  return {
    // Counts the attempt first, so concurrent requests cannot all slip through.
    hit(key) {
      const time = now();
      if (buckets.size > 10000) {
        for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= time) buckets.delete(bucketKey);
      }
      const current = buckets.get(key);
      const bucket = current && current.resetAt > time ? current : {count: 0, resetAt: time + windowMs};
      bucket.count += 1;
      buckets.set(key, bucket);
      return bucket.count <= limit;
    },
    reset(key) {
      buckets.delete(key);
    },
  };
}
