function parsePostedAt(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isWithinLast24Hours(postedAt, now = Date.now()) {
  const d = parsePostedAt(postedAt);
  if (!d) return false;
  const cutoff = now - 24 * 60 * 60 * 1000;
  return d.getTime() >= cutoff;
}

window.JobDateUtils = { parsePostedAt, isWithinLast24Hours };
