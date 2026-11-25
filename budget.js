(function attachBudgetTools(root) {
  const categories = [
    { id: "needs", name: "Needs", percent: 50, color: "cyan" },
    { id: "wants", name: "Wants", percent: 30, color: "purple" },
    { id: "savings", name: "Savings", percent: 20, color: "green" },
  ];
  const currencies = ["USD", "CAD", "EUR", "GBP", "AUD"];
  const capCents = (value) => Math.min(1_000_000_000, Math.max(0, Math.round(Number(value) || 0)));
  const validDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  };

  function createBudget() {
    return {
      currency: "USD",
      monthlyIncomeCents: 0,
      categories: categories.map((category) => ({ ...category, limitCents: 0 })),
      expenses: [],
      goals: [],
    };
  }

  function normalizeBudget(value = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
    const defaults = createBudget();
    const savedCategories = Array.isArray(value.categories) ? value.categories : [];
    const savedExpenses = Array.isArray(value.expenses) ? value.expenses : [];
    const savedGoals = Array.isArray(value.goals) ? value.goals : [];
    return {
      currency: currencies.includes(value.currency) ? value.currency : defaults.currency,
      monthlyIncomeCents: capCents(value.monthlyIncomeCents),
      categories: defaults.categories.map((category) => {
        const saved = savedCategories.find((item) => item?.id === category.id);
        return { ...category, limitCents: capCents(saved?.limitCents) };
      }),
      expenses: savedExpenses.slice(-1000).flatMap((expense) => {
        if (!expense || typeof expense.id !== "string" || typeof expense.description !== "string" ||
            !expense.description.trim() || !validDate(expense.date) ||
            !categories.some((category) => category.id === expense.categoryId)) return [];
        return [{
          id: expense.id.slice(0, 100),
          categoryId: expense.categoryId,
          description: expense.description.slice(0, 80),
          date: expense.date,
          amountCents: capCents(expense.amountCents),
        }];
      }),
      goals: savedGoals.slice(0, 20).flatMap((goal) => {
        if (!goal || typeof goal.id !== "string" || typeof goal.name !== "string" || !goal.name.trim()) return [];
        return [{
          id: goal.id.slice(0, 100),
          name: goal.name.trim().slice(0, 60),
          targetCents: Math.max(1, capCents(goal.targetCents)),
          savedCents: capCents(goal.savedCents),
          deadline: validDate(goal.deadline) ? goal.deadline : "",
        }];
      }),
    };
  }

  function centsFromAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return 0;
    return Math.round(amount * 100);
  }

  function monthKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  function summarizeBudget(budget, date = new Date()) {
    const month = monthKey(date);
    const byCategory = Object.fromEntries(budget.categories.map((category) => [category.id, 0]));
    let spentCents = 0;
    for (const expense of budget.expenses) {
      if (expense.date.slice(0, 7) !== month) continue;
      spentCents += expense.amountCents;
      byCategory[expense.categoryId] = (byCategory[expense.categoryId] || 0) + expense.amountCents;
    }
    return {
      month,
      spentCents,
      byCategory,
      budgetedCents: budget.categories.reduce((sum, category) => sum + category.limitCents, 0),
      remainingCents: budget.monthlyIncomeCents - spentCents,
      goalTargetCents: budget.goals.reduce((sum, goal) => sum + goal.targetCents, 0),
      goalSavedCents: budget.goals.reduce((sum, goal) => sum + goal.savedCents, 0),
    };
  }

  const api = { categories, currencies, createBudget, normalizeBudget, centsFromAmount, monthKey, summarizeBudget, isValidDate: validDate };
  root.NovexBudget = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
