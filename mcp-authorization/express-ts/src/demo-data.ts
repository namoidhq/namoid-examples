/**
 * In-memory stand-in for the customer's own system of record.
 *
 * Every record is owned by a NamoID user ID (`sub`) so the example can show
 * the part scopes never cover: a token with `invoices:read` still must not
 * read another user's invoices. Restart clears all state.
 */

export interface Customer {
  id: string;
  name: string;
  email: string;
  ownerSubject: string;
}

export interface Invoice {
  id: string;
  customerId: string;
  amountMinor: number;
  currency: string;
  status: "open" | "paid" | "refunded";
  ownerSubject: string;
}

/**
 * Records seeded for whichever user signs in first, so a fresh demo is never
 * an empty list. A real server would never reassign ownership like this.
 */
const SEED_CUSTOMERS: Omit<Customer, "ownerSubject">[] = [
  { id: "cus_2001", name: "Northwind Traders", email: "ap@northwind.example" },
  { id: "cus_2002", name: "Globex Corporation", email: "billing@globex.example" },
];

const SEED_INVOICES: Omit<Invoice, "ownerSubject">[] = [
  { id: "inv_5001", customerId: "cus_2001", amountMinor: 128_00, currency: "INR", status: "open" },
  { id: "inv_5002", customerId: "cus_2002", amountMinor: 940_00, currency: "INR", status: "paid" },
];

export class DemoStore {
  private readonly customers = new Map<string, Customer>();
  private readonly invoices = new Map<string, Invoice>();
  private readonly seeded = new Set<string>();
  private nextId = 9000;

  /** Give a first-time caller something to read. Idempotent per user. */
  private ensureSeeded(subject: string): void {
    if (this.seeded.has(subject)) return;
    this.seeded.add(subject);
    for (const customer of SEED_CUSTOMERS) {
      this.customers.set(`${subject}:${customer.id}`, { ...customer, ownerSubject: subject });
    }
    for (const invoice of SEED_INVOICES) {
      this.invoices.set(`${subject}:${invoice.id}`, { ...invoice, ownerSubject: subject });
    }
  }

  findCustomers(subject: string, query: string): Customer[] {
    this.ensureSeeded(subject);
    const needle = query.trim().toLowerCase();
    return [...this.customers.values()]
      .filter((customer) => customer.ownerSubject === subject)
      .filter(
        (customer) =>
          needle === "" ||
          customer.name.toLowerCase().includes(needle) ||
          customer.email.toLowerCase().includes(needle),
      );
  }

  listInvoices(subject: string, status?: Invoice["status"]): Invoice[] {
    this.ensureSeeded(subject);
    return [...this.invoices.values()]
      .filter((invoice) => invoice.ownerSubject === subject)
      .filter((invoice) => status === undefined || invoice.status === status);
  }

  getInvoice(subject: string, invoiceId: string): Invoice | undefined {
    this.ensureSeeded(subject);
    const invoice = this.invoices.get(`${subject}:${invoiceId}`);
    // Ownership is re-checked rather than inferred from the key so a future
    // key-format change cannot silently widen access.
    return invoice?.ownerSubject === subject ? invoice : undefined;
  }

  createInvoice(
    subject: string,
    input: { customerId: string; amountMinor: number; currency: string },
  ): Invoice {
    this.ensureSeeded(subject);
    const invoice: Invoice = {
      id: `inv_${this.nextId++}`,
      customerId: input.customerId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "open",
      ownerSubject: subject,
    };
    this.invoices.set(`${subject}:${invoice.id}`, invoice);
    return invoice;
  }

  markRefunded(subject: string, invoiceId: string): void {
    const invoice = this.getInvoice(subject, invoiceId);
    if (invoice) invoice.status = "refunded";
  }
}
