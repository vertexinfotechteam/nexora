/**
 * Reading a column as a date when the engine is storing it as text.
 *
 * A column is treated as a date by its semantic type, decided while profiling
 * from what the values look like. The engine may still be storing it as
 * VARCHAR, because that is what the file contained — a column of "Apr-25" is
 * unmistakably a month to a reader and is text to a database.
 *
 * Two things went wrong with handing that straight to date_trunc:
 *
 *   1. It failed the whole step — "No function matches the given name and
 *      argument types date_trunc(STRING_LITERAL, VARCHAR)" — taking the
 *      forecast down with it.
 *   2. A plain cast would not have saved it either: "Apr-25" is not a
 *      timestamp literal, so every row would have become NULL and the forecast
 *      would have found no series at all. Not crashing is not the same as
 *      working.
 *
 * So the expression tries the native cast first, then the shapes business data
 * actually arrives in. Anything it cannot read becomes NULL and drops out of
 * the series rather than stopping the analysis.
 */

/**
 * Formats attempted, in order, after a native cast fails.
 *
 * Deliberately limited to unambiguous shapes plus one genuinely ambiguous pair.
 * `%d/%m/%Y` is tried before `%m/%d/%Y`: both are in use, day-first is the
 * majority worldwide, and the alternative is refusing every slashed date.
 * A value matching neither becomes NULL, which is visible as a gap rather than
 * as a wrong date.
 */
const DATE_FORMATS = [
  "%Y-%m-%d",
  "%Y/%m/%d",
  "%d/%m/%Y",
  "%m/%d/%Y",
  "%d-%m-%Y",
  "%b-%y",
  "%b-%Y",
  "%b %Y",
  "%B %Y",
  "%Y-%m",
  "%m/%Y",
] as const;

/**
 * SQL that yields a TIMESTAMP for a column that may be a date or text.
 *
 * `identifier` must already be quoted by the caller — this does no escaping of
 * its own, so it cannot be handed raw user input.
 */
export function temporalExpr(identifier: string): string {
  const formats = DATE_FORMATS.map((format) => `'${format}'`).join(", ");

  /*
   * try_strptime only accepts VARCHAR, so the column is cast to text before it
   * is offered — without that, this expression fails on a column that is
   * already a proper DATE with "No function matches the given name and
   * argument types try_strptime(DATE, VARCHAR[])", breaking the well-formed
   * files to fix the awkward ones.
   *
   * The branch is never reached for such a column, because the cast above it
   * succeeds first, but SQL is bound before it is run: every branch has to
   * type-check whether or not it is evaluated.
   */
  return `coalesce(try_cast(${identifier} as timestamp), try_strptime(try_cast(${identifier} as varchar), [${formats}]))`;
}

/** `date_trunc` over a column that may be stored as text. */
export function truncTemporal(identifier: string, unit: string): string {
  const safe = ["day", "week", "month", "quarter", "year"].includes(unit) ? unit : "month";
  return `date_trunc('${safe}', ${temporalExpr(identifier)})`;
}
