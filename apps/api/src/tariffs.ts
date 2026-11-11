function readRate(key: string, fallback: number) {
  const configured = process.env[key];
  if (!configured?.trim()) return fallback;
  const rate = Number(configured);
  if (!Number.isInteger(rate) || rate <= 0 || rate > 2147483647) {
    throw new Error(`${key} must be a positive integer in kopecks`);
  }
  return rate;
}

export const tariffs = {
  hours: [1, 2, 3],
  fixedHourKopecks: readRate("FIXED_HOUR_KOPECKS", 59900),
  meteredMinuteKopecks: readRate("METERED_MINUTE_KOPECKS", 1300),
};

if (tariffs.fixedHourKopecks >= 60 * tariffs.meteredMinuteKopecks) {
  throw new Error("FIXED_HOUR_KOPECKS must cost less than 60 metered minutes");
}
