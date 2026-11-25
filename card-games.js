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

  function createFreecellGame(random = Math.random) {
    const deck = makeDeck(random).map((card) => ({ ...card, faceUp: true }));
    const tableau = Array.from({ length: 8 }, () => []);
    deck.forEach((card, index) => tableau[index % 8].push(card));
    return {
      tableau,
      cells: Array(4).fill(null),
      foundations: SUITS.map((suit) => ({ suit, cards: [] })),
      selected: null,
      moves: 0,
      won: false,
    };
  }

  function normalizeFreecell(value) {
    if (!value || !Array.isArray(value.tableau) || value.tableau.length !== 8 ||
        value.tableau.some((stack) => !Array.isArray(stack)) ||
        !Array.isArray(value.cells) || value.cells.length !== 4 ||
        !Array.isArray(value.foundations) || value.foundations.length !== 4 ||
        value.foundations.some((pile) => !pile || !SUITS.includes(pile.suit) || !Array.isArray(pile.cards))) return null;
    const allCards = [...value.tableau.flat(), ...value.cells.filter(Boolean), ...value.foundations.flatMap((pile) => pile.cards)];
    if (allCards.length !== 52) return null;
    const ids = new Set();
    for (const card of allCards) {
      if (!card || !SUITS.includes(card.suit) || !Number.isInteger(card.rank) || card.rank < 1 || card.rank > 13 ||
          card.id !== `${card.suit}-${card.rank}` || ids.has(card.id)) return null;
      ids.add(card.id);
    }
    return {
      tableau: value.tableau.map((stack) => stack.map((card) => ({ ...card, faceUp: true }))),
      cells: value.cells.map((card) => card ? { ...card, faceUp: true } : null),
      foundations: value.foundations.map((pile) => ({ suit: pile.suit, cards: pile.cards.map((card) => ({ ...card, faceUp: true })) })),
      selected: value.selected && ["cell", "tableau", "foundation"].includes(value.selected.zone) ? { ...value.selected } : null,
      moves: Math.max(0, Math.floor(Number(value.moves) || 0)),
      won: Boolean(value.won),
    };
  }

  function freecellSelectedCard(state) {
    const selected = state.selected;
    if (!selected) return null;
    if (selected.zone === "cell") return state.cells[selected.index] || null;
    if (selected.zone === "foundation") {
      const pile = state.foundations[selected.index];
      return pile?.cards[pile.cards.length - 1] || null;
    }
    const stack = state.tableau[selected.column];
    return stack?.[stack.length - 1] || null;
  }

  function moveFreecellCard(state, destination) {
    const card = freecellSelectedCard(state);
    if (!card) return false;
    const selected = state.selected;
    if (destination.zone === "cell") {
      if (state.cells[destination.index] != null || selected.zone === "cell") return false;
    } else if (destination.zone === "tableau") {
      const target = state.tableau[destination.column];
      if (!target || (selected.zone === "tableau" && selected.column === destination.column)) return false;
      const top = target[target.length - 1];
      if (top && (top.rank !== card.rank + 1 || RED_SUITS.has(top.suit) === RED_SUITS.has(card.suit))) return false;
    } else if (destination.zone === "foundation") {
      const pile = state.foundations[destination.index];
      if (!pile || pile.suit !== card.suit || pile.cards.length + 1 !== card.rank) return false;
    } else return false;

    let moving;
    if (selected.zone === "cell") {
      moving = state.cells[selected.index];
      state.cells[selected.index] = null;
    } else if (selected.zone === "foundation") {
      moving = state.foundations[selected.index].cards.pop();
    } else moving = state.tableau[selected.column].pop();

    if (destination.zone === "cell") state.cells[destination.index] = moving;
    else if (destination.zone === "tableau") state.tableau[destination.column].push(moving);
    else state.foundations[destination.index].cards.push(moving);
    state.selected = null;
    state.moves += 1;
    state.won = state.foundations.every((pile) => pile.cards.length === 13);
    return true;
  }

  function createBlackjackGame(botCount = 1, random = Math.random) {
    const deck = makeDeck(random).map((card) => ({ ...card, faceUp: true }));
    const players = [
      { id: "you", name: "You", human: true, hand: [], result: "" },
      ...Array.from({ length: Math.max(1, Math.min(6, Math.floor(Number(botCount) || 1))) }, (_, index) => ({
        id: `bot-${index + 1}`,
        name: `Bot ${index + 1}`,
        human: false,
        hand: [],
        result: "",
      })),
    ];
    const dealer = { hand: [] };
    const draw = (hand) => hand.push(deck.pop());
    players.forEach((player) => draw(player.hand));
    draw(dealer.hand);
    players.forEach((player) => draw(player.hand));
    draw(dealer.hand);
    return {
      deck,
      players,
      dealer,
      status: "playing",
      result: "",
      rounds: 1,
      botCount: players.length - 1,
    };
  }

  function blackjackScore(hand) {
    let total = 0;
    let aces = 0;
    for (const card of hand) {
      if (card.rank === 1) {
        total += 11;
        aces += 1;
      } else total += Math.min(card.rank, 10);
    }
    while (total > 21 && aces) {
      total -= 10;
      aces -= 1;
    }
    return total;
  }

  function settleBlackjack(game) {
    while (blackjackScore(game.dealer.hand) < 17 && game.deck.length) game.dealer.hand.push(game.deck.pop());
    const dealerScore = blackjackScore(game.dealer.hand);
    for (const player of game.players) {
      const score = blackjackScore(player.hand);
      player.result = score > 21 ? "bust" : dealerScore > 21 || score > dealerScore ? "win" : score === dealerScore ? "push" : "loss";
    }
    game.status = "settled";
    const human = game.players[0];
    game.result = human.result === "win" ? "You beat the dealer!" :
      human.result === "push" ? "A push — you and the dealer tie." :
      human.result === "bust" ? "You went over 21. Dealer wins this hand." : "Dealer wins this hand.";
    return game;
  }

  function hitBlackjack(game) {
    if (!game || game.status !== "playing" || !game.deck.length) return false;
    const player = game.players[0];
    player.hand.push(game.deck.pop());
    if (blackjackScore(player.hand) >= 21) standBlackjack(game);
    return true;
  }

  function standBlackjack(game) {
    if (!game || game.status !== "playing") return false;
    for (const player of game.players.slice(1)) {
      while (blackjackScore(player.hand) < 17 && game.deck.length) player.hand.push(game.deck.pop());
    }
    settleBlackjack(game);
    return true;
  }

  function normalizeBlackjack(value) {
    if (!value || !Array.isArray(value.deck) || !Array.isArray(value.players) ||
        value.players.length < 2 || value.players.length > 7 || !value.dealer || !Array.isArray(value.dealer.hand)) return null;
    const allCards = [...value.deck, ...value.dealer.hand, ...value.players.flatMap((player) => player?.hand || [])];
    if (allCards.length !== 52) return null;
    const ids = new Set();
    for (const card of allCards) {
      if (!card || !SUITS.includes(card.suit) || !Number.isInteger(card.rank) || card.rank < 1 || card.rank > 13 ||
          card.id !== `${card.suit}-${card.rank}` || ids.has(card.id)) return null;
      ids.add(card.id);
    }
    const players = value.players.map((player, index) => ({
      id: index === 0 ? "you" : `bot-${index}`,
      name: index === 0 ? "You" : `Bot ${index}`,
      human: index === 0,
      hand: player.hand.map((card) => ({ ...card, faceUp: true })),
      result: ["", "win", "loss", "push", "bust"].includes(player.result) ? player.result : "",
    }));
    return {
      deck: value.deck.map((card) => ({ ...card, faceUp: true })),
      players,
      dealer: { hand: value.dealer.hand.map((card) => ({ ...card, faceUp: true })) },
      status: value.status === "settled" ? "settled" : "playing",
      result: typeof value.result === "string" ? value.result.slice(0, 100) : "",
      rounds: Math.max(1, Math.floor(Number(value.rounds) || 1)),
      botCount: players.length - 1,
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
      freecellWins: integer(value.freecellWins),
      blackjackWins: integer(value.blackjackWins),
      blackjackGames: integer(value.blackjackGames),
      botGames: integer(value.botGames),
      totalGamesPlayed: integer(value.totalGamesPlayed),
      currentWinStreak: integer(value.currentWinStreak),
      highestWinStreak: integer(value.highestWinStreak),
      dailySpinDate: typeof value.dailySpinDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.dailySpinDate) ? value.dailySpinDate : "",
      dailySpinReward: typeof value.dailySpinReward === "string" ? value.dailySpinReward.slice(0, 80) : "",
      completedRoomIds: Array.isArray(value.completedRoomIds)
        ? [...new Set(value.completedRoomIds.filter((id) => typeof id === "string").slice(-100))]
        : [],
      solitaire: normalizeSolitaire(value.solitaire),
      freecell: normalizeFreecell(value.freecell),
      blackjack: normalizeBlackjack(value.blackjack),
    };
  }

  function goFishSecondsRemaining(deadline, now = Date.now()) {
    const deadlineTime = Date.parse(deadline);
    if (!Number.isFinite(deadlineTime)) return null;
    return Math.max(0, Math.ceil((deadlineTime - now) / 1000));
  }

  const api = {
    suits: SUITS,
    redSuits: [...RED_SUITS],
    makeDeck,
    createSolitaireGame,
    normalizeSolitaire,
    createFreecellGame,
    normalizeFreecell,
    freecellSelectedCard,
    moveFreecellCard,
    createBlackjackGame,
    normalizeBlackjack,
    blackjackScore,
    hitBlackjack,
    standBlackjack,
    normalizeGameStats,
    validRun,
    selectedCards,
    moveSelected,
    drawFromStock,
    hintFor,
    goFishSecondsRemaining,
  };
  root.NovexCardGames = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
