export interface Money {
  amount: number;
  currency: string;
}

/**
 * The locale is fixed rather than read from the request.
 *
 * There is no i18n framework here by decision, so the UI is one language, and a
 * currency rendered per the reader's locale beside labels that are not would be
 * inconsistent rather than helpful. It also keeps the server's rendering
 * identical to what any client would produce.
 */
const LOCALE = "en-GB";

/**
 * An unfamiliar currency is not a problem: `Intl` renders any well-formed code
 * it has no symbol for as the code itself, so "XYZ 1,000" needs no help from us.
 * What it refuses is a code that is not three ASCII letters, and that throws.
 *
 * The API cannot send one - it validates exactly that shape and uppercases it -
 * so the fallback is about this function's own contract rather than about the
 * contract's. A caller reaching it with something malformed gets a plainer row
 * instead of taking the screen down.
 */
export function formatMoney(money: Money | null | undefined): string | null {
  if (money === null || money === undefined) return null;

  try {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency: money.currency,
      // Salaries are whole numbers far more often than not, and a column of
      // ".00" is noise. A figure that does carry pence still shows them.
      maximumFractionDigits: Number.isInteger(money.amount) ? 0 : 2,
    }).format(money.amount);
  } catch {
    return `${money.amount.toLocaleString(LOCALE)} ${money.currency}`;
  }
}
