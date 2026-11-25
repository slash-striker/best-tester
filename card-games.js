(function attachCardGames(root) {
  const SUITS = ["clubs", "diamonds", "hearts", "spades"];
  const RED_SUITS = new Set(["diamonds", "hearts"]);

  function makeDeck(random = Math.random) {
    const cards = SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, index) => ({
      id: `${suit}-${index + 1}`,
      suit,
      rank: index + 1,
      faceUp: false,
    })));
    for (let index = cards.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [cards[index], cards[other]] = [cards[other], cards[index]];
    }
    return cards;
  }

  function createSolitaireGame(random = Math.random) {
    const deck = makeDeck(random);
    const tableau = Array.from({ length: 7 }, (_, column) => {
      const stack = deck.splice(0, column + 1);
      stack[stack.length - 1].faceUp = true;
      return stack;
    });
    return {
      stock: deck,
      waste: [],
      tableau,
      foundations: SUITS.map((suit) => ({ suit, cards: [] })),
      selected: null,
      moves: 0,
      won: false,
    };
  }

  function validRun(cards) {
    return cards.length > 0 && cards.every((card, index) => {
      if (!card.faceUp) return false;
      if (!index) return true;
      const previous = cards[index - 1];
      return previous.rank === card.rank + 1 && RED_SUITS.has(previous.suit) !== RED_SUITS.has(card.suit);
    });
  }

  function normalizeSolitaire(value) {
    if (!value || !Array.isArray(value.stock) || !Array.isArray(value.waste) ||
        !Array.isArray(value.tableau) || value.tableau.length !== 7 ||
        value.tableau.some((stack) => !Array.isArray(stack)) ||
        !Array.isArray(value.foundations) || value.foundations.length !== 4 ||
        value.foundations.some((pile) => !pile || !SUITS.includes(pile.suit) || !Array.isArray(pile.cards))) return null;
    const allCards = [...value.stock, ...value.waste, ...value.tableau.flat(), ...value.foundations.flatMap((pile) => pile.cards || [])];
    if (allCards.length !== 52) return null;
    const ids = new Set();
    for (const card of allCards) {
      if (!card || !SUITS.includes(card.suit) || !Number.isInteger(card.rank) || card.rank < 1 || card.rank > 13 ||
          card.id !== `${card.suit}-${card.rank}` || ids.has(card.id)) return null;
      ids.add(card.id);
    }
    const selected = value.selected && ["tableau", "waste", "foundation"].includes(value.selected.zone)
      ? { ...value.selected } : null;
    return {
      stock: value.stock.map((card) => ({ ...card, faceUp: false })),
      waste: value.waste.map((card) => ({ ...card, faceUp: true })),
      tableau: value.tableau.map((stack) => stack.map((card) => ({ ...card, faceUp: Boolean(card.faceUp) }))),
      foundations: value.foundations.map((pile) => ({ suit: pile.suit, cards: pile.cards.map((card) => ({ ...card, faceUp: true })) })),
      selected,
      moves: Math.max(0, Math.floor(Number(value.moves) || 0)),
      won: Boolean(value.won),
    };
  }

  function selectedCards(state) {
    const selected = state.selected;
    if (!selected) return [];
    if (selected.zone === "waste") return state.waste.length ? [state.waste[state.waste.length - 1]] : [];
    if (selected.zone === "foundation") {
      const pile = state.foundations[selected.pile];
      return pile?.cards.length ? [pile.cards[pile.cards.length - 1]] : [];
    }
    const stack = state.tableau[selected.column];
    return stack?.slice(selected.index) || [];
  }

  function removeSelected(state) {
    const selected = state.selected;
    let moving;
    if (selected.zone === "waste") moving = [state.waste.pop()];
    else if (selected.zone === "foundation") moving = [state.foundations[selected.pile].cards.pop()];
    else {
      const stack = state.tableau[selected.column];
      moving = stack.splice(selected.index);
      if (stack.length) stack[stack.length - 1].faceUp = true;
    }
    state.selected = null;
    return moving;
  }

  function moveSelected(state, destination) {
    const moving = selectedCards(state);
    if (!moving.length) return false;
    const card = moving[0];
    if (destination.zone === "tableau") {
      const target = state.tableau[destination.column];
      if (!target) return false;
      const top = target[target.length - 1];
      if ((!top && card.rank !== 13) ||
          (top && (top.rank !== card.rank + 1 || RED_SUITS.has(top.suit) === RED_SUITS.has(card.suit))) ||
          !validRun(moving) || (state.selected.zone === "tableau" && state.selected.column === destination.column)) return false;
      target.push(...removeSelected(state));
    } else if (destination.zone === "foundation") {
      if (moving.length !== 1) return false;
      const pile = state.foundations[destination.pile];
      if (!pile || pile.suit !== card.suit || pile.cards.length + 1 !== card.rank) return false;
      pile.cards.push(...removeSelected(state));
    } else return false;
    state.moves += 1;
    state.won = state.foundations.every((pile) => pile.cards.length === 13);
    return true;
  }

  function drawFromStock(state) {
    state.selected = null;
    if (state.stock.length) {
      const card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
      state.moves += 1;
      return true;
    }
    if (state.waste.length) {
      state.stock = state.waste.splice(0).reverse().map((card) => ({ ...card, faceUp: false }));
      state.moves += 1;
      return true;
    }
    return false;
  }

  function hintFor(state) {
    const topCards = [
      ...state.waste.map((card) => ({ card, zone: "waste" })).slice(-1),
      ...state.tableau.flatMap((stack, column) => stack.length ? [{ card: stack[stack.length - 1], zone: "tableau", column }] : []),
    ];
    for (const { card, zone, column } of topCards) {
      const pile = state.foundations.find((foundation) => foundation.suit === card.suit);
      if (pile && pile.cards.length + 1 === card.rank) return "A foundation is ready for that card.";
    }
    if (state.stock.length || state.waste.length) return "Turn over the next card, or recycle the waste pile.";
    return "No move found. Start a fresh deal and try a new path.";
  }

  function normalizeGameStats(value = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
    const integer = (entry) => Math.min(1_000_000, Math.max(0, Math.floor(Number(entry) || 0)));
    return {
      solitaireWins: integer(value.solitaireWins),
      solitaireMoves: integer(value.solitaireMoves),
      goFishWins: integer(value.goFishWins),
      goFishGames: integer(value.goFishGames),
      completedRoomIds: Array.isArray(value.completedRoomIds)
        ? [...new Set(value.completedRoomIds.filter((id) => typeof id === "string").slice(-100))]
        : [],
      solitaire: normalizeSolitaire(value.solitaire),
    };
  }

  const api = {
    suits: SUITS,
    redSuits: [...RED_SUITS],
    makeDeck,
    createSolitaireGame,
    normalizeSolitaire,
    normalizeGameStats,
    validRun,
    selectedCards,
    moveSelected,
    drawFromStock,
    hintFor,
  };
  root.NovexCardGames = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
