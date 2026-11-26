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
    return stack?.[selected.index ?? stack.length - 1] || null;
  }

  function freecellSelectedCards(state) {
    const selected = state.selected;
    if (!selected) return [];
    if (selected.zone !== "tableau") {
      const card = freecellSelectedCard(state);
      return card ? [card] : [];
    }
    return state.tableau[selected.column]?.slice(selected.index ?? -1) || [];
  }

  function freecellMoveCapacity(state, sourceColumn, destinationColumn) {
    const emptyCells = state.cells.filter((card) => card == null).length;
    const emptyColumns = state.tableau.filter((stack, index) =>
      stack.length === 0 && index !== sourceColumn && index !== destinationColumn
    ).length;
    return (emptyCells + 1) * (2 ** emptyColumns);
  }

  function moveFreecellCard(state, destination) {
    const moving = freecellSelectedCards(state);
    if (!moving.length || !validRun(moving)) return false;
    const card = moving[0];
    const selected = state.selected;
    if (destination.zone === "cell") {
      if (!Number.isInteger(destination.index) || destination.index < 0 || destination.index > 3 ||
          state.cells[destination.index] != null || selected.zone === "cell" || moving.length !== 1) return false;
    } else if (destination.zone === "tableau") {
      const target = state.tableau[destination.column];
      if (!target || (selected.zone === "tableau" && selected.column === destination.column)) return false;
      const top = target[target.length - 1];
      if (top && (top.rank !== card.rank + 1 || RED_SUITS.has(top.suit) === RED_SUITS.has(card.suit))) return false;
      if (selected.zone === "tableau" &&
          moving.length > freecellMoveCapacity(state, selected.column, destination.column)) return false;
    } else if (destination.zone === "foundation") {
      const pile = state.foundations[destination.index];
      if (!pile || pile.suit !== card.suit || pile.cards.length + 1 !== card.rank || moving.length !== 1) return false;
    } else return false;

    if (selected.zone === "cell") {
      const cardToMove = state.cells[selected.index];
      state.cells[selected.index] = null;
      moving[0] = cardToMove;
    } else if (selected.zone === "foundation") {
      moving[0] = state.foundations[selected.index].cards.pop();
    } else state.tableau[selected.column].splice(selected.index ?? state.tableau[selected.column].length - 1);

    if (destination.zone === "cell") state.cells[destination.index] = moving[0];
    else if (destination.zone === "tableau") state.tableau[destination.column].push(...moving);
    else state.foundations[destination.index].cards.push(...moving);
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
    const game = {
      deck,
      players,
      dealer,
      status: "playing",
      result: "",
      rounds: 1,
      botCount: players.length - 1,
    };
    if (blackjackNatural(players[0].hand) || blackjackNatural(dealer.hand)) {
      settleBlackjack(game);
    }
    return game;
  }

  function normalizeMiniGolf(value) {
    if (!value || !Array.isArray(value.players) || value.players.length < 2 || value.players.length > 4 ||
        !Number.isInteger(value.hole) || value.hole < 1 || value.hole > MINI_GOLF_HOLES.length ||
        !Number.isInteger(value.currentPlayer) || value.currentPlayer < 0 || value.currentPlayer >= value.players.length) return null;
    const players = value.players.map((player, index) => {
      if (!player || !Array.isArray(player.scores) || player.scores.length > MINI_GOLF_HOLES.length ||
          !Number.isInteger(player.total) || player.total < 0 ||
          !Number.isInteger(player.holeStrokes) || player.holeStrokes < 0 || player.holeStrokes > 20 ||
          !Number.isFinite(player.remaining) || player.remaining < 0 || player.remaining > 1000) return null;
      const scores = player.scores.map((score) => Number.isInteger(score) && score >= 1 && score <= 20 ? score : null);
      if (scores.some((score) => score === null) || scores.reduce((sum, score) => sum + score, 0) !== player.total) return null;
      return {
        id: index === 0 ? "you" : `bot-${index}`,
        name: index === 0 ? "You" : `Bot ${index}`,
        human: index === 0,
        total: player.total,
        scores,
        holeStrokes: player.holeStrokes,
        remaining: player.remaining,
        holed: Boolean(player.holed),
      };
    });
    if (players.some((player) => !player)) return null;
    return {
      players,
      hole: value.hole,
      currentPlayer: value.currentPlayer,
      status: value.status === "finished" ? "finished" : "playing",
      winner: typeof value.winner === "string" && players.some((player) => player.id === value.winner) ? value.winner : "",
      lastShot: typeof value.lastShot === "string" ? value.lastShot.slice(0, 120) : "",
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

  function blackjackNatural(hand) {
    return hand.length === 2 && blackjackScore(hand) === 21;
  }

  function blackjackSoftScore(hand) {
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
    return aces > 0;
  }

  function settleBlackjack(game) {
    while (blackjackScore(game.dealer.hand) < 17 && game.deck.length) game.dealer.hand.push(game.deck.pop());
    const dealerScore = blackjackScore(game.dealer.hand);
    const dealerNatural = blackjackNatural(game.dealer.hand);
    for (const player of game.players) {
      const score = blackjackScore(player.hand);
      const playerNatural = blackjackNatural(player.hand);
      player.result = score > 21 ? "bust" :
        playerNatural && dealerNatural ? "push" :
          playerNatural ? "blackjack" :
            dealerNatural ? "loss" :
              dealerScore > 21 || score > dealerScore ? "win" : score === dealerScore ? "push" : "loss";
    }
    game.status = "settled";
    const human = game.players[0];
    game.result = human.result === "blackjack" ? "Blackjack! You beat the dealer." :
      human.result === "win" ? "You beat the dealer!" :
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
      while (blackjackScore(player.hand) < 17 ||
          (blackjackScore(player.hand) === 17 && blackjackSoftScore(player.hand))) {
        if (!game.deck.length) break;
        player.hand.push(game.deck.pop());
      }
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
      result: ["", "win", "blackjack", "loss", "push", "bust"].includes(player.result) ? player.result : "",
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
    if (!moving.length || moving.some((card) => !card.faceUp)) return false;
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
    const movableRuns = state.tableau.flatMap((stack, sourceColumn) =>
      stack.flatMap((card, index) => card.faceUp && validRun(stack.slice(index))
        ? [{ card, sourceColumn }]
        : [])
    );
    for (const { card, sourceColumn } of movableRuns) {
      for (let column = 0; column < state.tableau.length; column += 1) {
        if (column === sourceColumn) continue;
        const target = state.tableau[column];
        const top = target[target.length - 1];
        if ((!top && card.rank === 13) ||
            (top && top.rank === card.rank + 1 && RED_SUITS.has(top.suit) !== RED_SUITS.has(card.suit))) {
          return "Move a face-up card or descending run to another tableau column.";
        }
      }
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
      miniGolfWins: integer(value.miniGolfWins),
      miniGolfGames: integer(value.miniGolfGames),
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
      miniGolf: normalizeMiniGolf(value.miniGolf),
    };
  }

  const MINI_GOLF_HOLES = [
    { par: 2, distance: 45 },
    { par: 3, distance: 78 },
    { par: 3, distance: 92 },
    { par: 4, distance: 118 },
    { par: 2, distance: 53 },
    { par: 4, distance: 132 },
    { par: 3, distance: 84 },
    { par: 4, distance: 145 },
    { par: 3, distance: 99 },
  ];

  function nextMiniGolfPlayer(game) {
    const start = (game.currentPlayer + 1) % game.players.length;
    for (let offset = 0; offset < game.players.length; offset += 1) {
      const index = (start + offset) % game.players.length;
      if (!game.players[index].holed) {
        game.currentPlayer = index;
        return;
      }
    }
    game.currentPlayer = 0;
  }

  function createMiniGolfGame(botCount = 2) {
    const count = Math.max(1, Math.min(3, Math.floor(Number(botCount) || 1)));
    const players = [
      { id: "you", name: "You", human: true, total: 0, scores: [], holeStrokes: 0, remaining: MINI_GOLF_HOLES[0].distance, holed: false },
      ...Array.from({ length: count }, (_, index) => ({
        id: `bot-${index + 1}`,
        name: `Bot ${index + 1}`,
        human: false,
        total: 0,
        scores: [],
        holeStrokes: 0,
        remaining: MINI_GOLF_HOLES[0].distance,
        holed: false,
      })),
    ];
    return { players, hole: 1, currentPlayer: 0, status: "playing", winner: "", lastShot: "Choose your aim and power.", botCount: count };
  }

  function finishMiniGolfHole(game, player) {
    const finishedHole = game.hole;
    const hole = MINI_GOLF_HOLES[game.hole - 1];
    player.holed = true;
    player.scores.push(player.holeStrokes);
    player.total += player.holeStrokes;
    player.remaining = 0;

    if (game.players.every((entry) => entry.holed)) {
      if (game.hole === MINI_GOLF_HOLES.length) {
        game.status = "finished";
        const winner = [...game.players].sort((a, b) => a.total - b.total)[0];
        game.winner = winner.id;
        game.lastShot = `${winner.name} wins the course with ${winner.total} strokes!`;
        return;
      }
      game.hole += 1;
      const nextHole = MINI_GOLF_HOLES[game.hole - 1];
      game.players.forEach((entry) => {
        entry.holeStrokes = 0;
        entry.remaining = nextHole.distance;
        entry.holed = false;
      });
    }

    nextMiniGolfPlayer(game);
    game.lastShot = `${player.name} finished hole ${finishedHole}.`;
  }

  function takeMiniGolfShot(game, power, angle, random) {
    const player = game.players[game.currentPlayer];
    if (!player || player.holed || game.status !== "playing") return false;
    const boundedAngle = Math.max(-45, Math.min(45, angle));
    const travel = power * (1.1 - Math.abs(boundedAngle) / 180);
    const drift = Math.abs(boundedAngle) * 0.16 + random() * 2.5;
    const newDistance = Math.max(0, Math.abs(player.remaining - travel) + drift);
    player.holeStrokes += 1;
    player.remaining = newDistance;
    game.lastShot = `${player.name} took stroke ${player.holeStrokes}. ${newDistance <= 3 ? "On the green!" : `${Math.round(newDistance)} m to the cup.`}`;
    if (newDistance <= 3 || player.holeStrokes >= MINI_GOLF_HOLES[game.hole - 1].par + 4) {
      finishMiniGolfHole(game, player);
    } else {
      nextMiniGolfPlayer(game);
    }
    return true;
  }

  function playMiniGolfShot(game, { power, angle = 0 } = {}, random = Math.random) {
    if (!game || game.status !== "playing" || !Number.isFinite(power) || power < 1 || power > 100 ||
        !Number.isFinite(angle) || angle < -45 || angle > 45 ||
        !game.players[game.currentPlayer]?.human) return false;
    const played = takeMiniGolfShot(game, power, angle, random);
    advanceMiniGolfBots(game, random);
    return played;
  }

  function advanceMiniGolfBots(game, random = Math.random) {
    let steps = 0;
    while (game.status === "playing" && !game.players[game.currentPlayer]?.human && steps < 40) {
      const player = game.players[game.currentPlayer];
      const power = Math.max(1, Math.min(100, player.remaining / 1.1));
      takeMiniGolfShot(game, power, (random() - 0.5) * 14, random);
      steps += 1;
    }
    return game;
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
    blackjackNatural,
    hitBlackjack,
    standBlackjack,
    createMiniGolfGame,
    normalizeMiniGolf,
    playMiniGolfShot,
    advanceMiniGolfBots,
    miniGolfHoles: MINI_GOLF_HOLES,
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
