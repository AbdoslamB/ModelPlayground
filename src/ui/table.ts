export interface TableColumn<Row> {
  key: string;
  header: string;
  unit?: string;
  decimals: number;
  /** Used for sorting, and shown when there is no `text`. */
  value: (row: Row) => number;
  /** Shown instead of the number, e.g. a class name. */
  text?: (row: Row) => string;
  /** Role class for the header and cells, e.g. "sym-line". */
  role?: string;
  /** Symbol highlighted across the Lab while the header is hovered. */
  highlight?: string;
}
