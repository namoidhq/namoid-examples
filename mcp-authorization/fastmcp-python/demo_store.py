"""In-memory stand-in for the customer's own system of record.

Every record is owned by a NamoID user ID (``sub``) so the example can show the
part scopes never cover: a token with ``invoices:read`` still must not read
another user's invoices. Restart clears all state.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from itertools import count
from typing import Literal

InvoiceStatus = Literal["open", "paid", "refunded"]


@dataclass
class Customer:
    id: str
    name: str
    email: str
    owner_subject: str

    def public(self) -> dict[str, str]:
        return {"id": self.id, "name": self.name, "email": self.email}


@dataclass
class Invoice:
    id: str
    customer_id: str
    amount_minor: int
    currency: str
    status: InvoiceStatus
    owner_subject: str

    def public(self) -> dict[str, object]:
        return {
            "id": self.id,
            "customerId": self.customer_id,
            "amountMinor": self.amount_minor,
            "currency": self.currency,
            "status": self.status,
        }


# Records seeded for whichever user signs in first, so a fresh demo is never an
# empty list. A real server would never reassign ownership like this.
_SEED_CUSTOMERS = [
    ("cus_2001", "Northwind Traders", "ap@northwind.example"),
    ("cus_2002", "Globex Corporation", "billing@globex.example"),
]

_SEED_INVOICES: list[tuple[str, str, int, str, InvoiceStatus]] = [
    ("inv_5001", "cus_2001", 12_800, "INR", "open"),
    ("inv_5002", "cus_2002", 94_000, "INR", "paid"),
]


@dataclass
class DemoStore:
    _customers: dict[tuple[str, str], Customer] = field(default_factory=dict)
    _invoices: dict[tuple[str, str], Invoice] = field(default_factory=dict)
    _seeded: set[str] = field(default_factory=set)
    _ids: count[int] = field(default_factory=lambda: count(9000))

    def _ensure_seeded(self, subject: str) -> None:
        """Give a first-time caller something to read. Idempotent per user."""
        if subject in self._seeded:
            return
        self._seeded.add(subject)
        for customer_id, name, email in _SEED_CUSTOMERS:
            self._customers[(subject, customer_id)] = Customer(
                id=customer_id, name=name, email=email, owner_subject=subject
            )
        for invoice_id, customer_id, amount, currency, status in _SEED_INVOICES:
            self._invoices[(subject, invoice_id)] = Invoice(
                id=invoice_id,
                customer_id=customer_id,
                amount_minor=amount,
                currency=currency,
                status=status,
                owner_subject=subject,
            )

    def find_customers(self, subject: str, query: str = "") -> list[Customer]:
        self._ensure_seeded(subject)
        needle = query.strip().lower()
        return [
            customer
            for customer in self._customers.values()
            if customer.owner_subject == subject
            and (
                not needle
                or needle in customer.name.lower()
                or needle in customer.email.lower()
            )
        ]

    def list_invoices(self, subject: str, status: InvoiceStatus | None = None) -> list[Invoice]:
        self._ensure_seeded(subject)
        return [
            invoice
            for invoice in self._invoices.values()
            if invoice.owner_subject == subject and (status is None or invoice.status == status)
        ]

    def get_invoice(self, subject: str, invoice_id: str) -> Invoice | None:
        self._ensure_seeded(subject)
        invoice = self._invoices.get((subject, invoice_id))
        # Ownership is re-checked rather than inferred from the key so a future
        # key-format change cannot silently widen access.
        if invoice is None or invoice.owner_subject != subject:
            return None
        return invoice

    def create_invoice(
        self, subject: str, *, customer_id: str, amount_minor: int, currency: str
    ) -> Invoice:
        self._ensure_seeded(subject)
        invoice = Invoice(
            id=f"inv_{next(self._ids)}",
            customer_id=customer_id,
            amount_minor=amount_minor,
            currency=currency,
            status="open",
            owner_subject=subject,
        )
        self._invoices[(subject, invoice.id)] = invoice
        return invoice

    def mark_refunded(self, subject: str, invoice_id: str) -> None:
        invoice = self.get_invoice(subject, invoice_id)
        if invoice is not None:
            invoice.status = "refunded"
