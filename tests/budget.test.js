const test = require("node:test");
const assert = require("node:assert/strict");
const budgetTools = require("../budget.js");

test("budget inputs normalize to supported categories, currency, dates, and cents", () => {
  const budget = budgetTools.normalizeBudget({
    currency: "EUR",
    monthlyIncomeCents: 500000,
    categories: [{ id: "needs", limitCents: 230000 }, { id: "unexpected", limitCents: 1 }],
    expenses: [
      { id: "good", description: "Rent", categoryId: "needs", amountCents: 120000, date: "2026-03-01" },
      { id: "bad-date", description: "Not a date", categoryId: "needs", amountCents: 100, date: "2026-02-31" },
      { id: "bad-category", description: "Unknown", categoryId: "unexpected", amountCents: 100, date: "2026-03-01" },
    ],
  });

  assert.equal(budget.currency, "EUR");
  assert.equal(budget.categories.find((category) => category.id === "needs").limitCents, 230000);
  assert.equal(budget.categories.length, 3);
  assert.deepEqual(budget.expenses.map((expense) => expense.id), ["good"]);
  assert.equal(budgetTools.centsFromAmount("19.99"), 1999);
  assert.equal(budgetTools.centsFromAmount("-1"), 0);
});

test("budget summary counts only this month's expenses and reports goal progress totals", () => {
  const budget = budgetTools.normalizeBudget({
    monthlyIncomeCents: 400000,
    expenses: [
      { id: "march", description: "Food", categoryId: "needs", amountCents: 2500, date: "2026-03-05" },
      { id: "february", description: "Old bill", categoryId: "needs", amountCents: 9000, date: "2026-02-28" },
    ],
    goals: [{ id: "trip", name: "Trip", targetCents: 50000, savedCents: 12000 }],
  });

  const summary = budgetTools.summarizeBudget(budget, new Date(2026, 2, 15));
  assert.equal(summary.month, "2026-03");
  assert.equal(summary.spentCents, 2500);
  assert.equal(summary.byCategory.needs, 2500);
  assert.equal(summary.remainingCents, 397500);
  assert.equal(summary.goalTargetCents, 50000);
  assert.equal(summary.goalSavedCents, 12000);
});

test("malformed saved budget values normalize safely to an empty plan", () => {
  assert.deepEqual(budgetTools.normalizeBudget(null), budgetTools.createBudget());
  assert.equal(budgetTools.isValidDate("2026-02-31"), false);
  assert.equal(budgetTools.isValidDate("2026-02-28"), true);
});
