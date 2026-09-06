/**
 * A calendar day in the device's *local* time zone, formatted `YYYY-MM-DD`.
 *
 * Momentum never uses UTC calendar boundaries: a check-in belongs to the day
 * the user experienced, not to the day UTC happened to be on.
 */
export type DateKey = string;

/** An ISO-8601 week, formatted `YYYY-Www` (weeks run Monday to Sunday). */
export type WeekKey = string;

/** Monday = 0 … Sunday = 6. Deliberately not JavaScript's Sunday-first order. */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
