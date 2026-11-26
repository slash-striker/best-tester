const test = require("node:test");
const assert = require("node:assert/strict");
const games = require("../card-games.js");

test("Klondike deals all 52 cards with only each column's top card face up", () => {
  const game = games.createSolitaireGame(() => 0.37);
  const cards = [...game.stock, ...game.tableau.flat()];

  assert.equal(cards.length, 52);
  assert.equal(new Set(cards.map((card) => card.id)).size, 52);
  assert.deepEqual(game.tableau.map((stack) => stack.length), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(game.tableau.flat().filter((card) => card.faceUp).length, 7);
  assert.equal(game.stock.length, 24);
});

test("Klondike allows alternating descending runs and rejects same-color stacks", () => {
  const makeState = (targetSuit) => {
    const cards = games.makeDeck(() => 0.2);
    const lookup = (suit, rank) => ({ ...cards.find((card) => card.suit === suit && card.rank === rank), faceUp: true });
    const source = lookup("clubs", 7);
    const target = lookup(targetSuit, 8);
    const placed = new Set([source.id, target.id]);
    return {
      stock: cards.filter((card) => !placed.has(card.id)),
      waste: [],
      tableau: [[source], [target], [], [], [], [], []],
      foundations: games.suits.map((suit) => ({ suit, cards: [] })),
      selected: { zone: "tableau", column: 0, index: 0 },
      moves: 0,
      won: false,
    };
  };
  const legal = makeState("hearts");
  assert.equal(games.moveSelected(legal, { zone: "tableau", column: 1 }), true);
  assert.equal(legal.tableau[1].length, 2);
  assert.equal(legal.tableau[0].length, 0);

  const illegal = makeState("spades");
  assert.equal(games.moveSelected(illegal, { zone: "tableau", column: 1 }), false);
  assert.equal(illegal.tableau[0].length, 1);
});

test("stock recycles the waste in playable order and saved deals are validated", () => {
  const game = games.createSolitaireGame(() => 0.61);
  for (let index = 0; index < 24; index += 1) assert.equal(games.drawFromStock(game), true);
  assert.equal(game.stock.length, 0);
  assert.equal(game.waste.length, 24);
  assert.equal(games.drawFromStock(game), true);
  assert.equal(game.stock.length, 24);
  assert.equal(game.waste.length, 0);
  assert.equal(games.normalizeSolitaire(game).stock.length, 24);

  const corrupted = structuredClone(game);
  corrupted.stock[0] = corrupted.stock[1];
  assert.equal(games.normalizeSolitaire(corrupted), null);
  assert.equal(games.normalizeGameStats(null).solitaire, null);
});

test("Klondike never allows a face-down card to move to a foundation", () => {
  const deck = games.makeDeck(() => 0.3);
  const ace = { ...deck.find((card) => card.suit === "clubs" && card.rank === 1), faceUp: false };
  const state = {
    stock: deck.filter((card) => card.id !== ace.id),
    waste: [],
    tableau: [[ace], [], [], [], [], [], []],
    foundations: games.suits.map((suit) => ({ suit, cards: [] })),
    selected: { zone: "tableau", column: 0, index: 0 },
    moves: 0,
    won: false,
  };
  assert.equal(games.moveSelected(state, { zone: "foundation", pile: 0 }), false);
  assert.equal(state.tableau[0][0].id, ace.id);
});

test("FreeCell deals a complete face-up deck and only permits legal color/rank moves", () => {
  const game = games.createFreecellGame(() => 0.37);
  const cards = [...game.tableau.flat(), ...game.cells.filter(Boolean)];
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards.map((card) => card.id)).size, 52);
  assert.ok(cards.every((card) => card.faceUp));

  const deck = games.makeDeck(() => 0.2);
  const card = (suit, rank) => ({ ...deck.find((entry) => entry.suit === suit && entry.rank === rank), faceUp: true });
  const moving = card("clubs", 7);
  const target = card("hearts", 8);
  const used = new Set([moving.id, target.id]);
  const rest = deck.filter((entry) => !used.has(entry.id)).map((entry) => ({ ...entry, faceUp: true }));
  const state = {
    tableau: [[moving], [target], rest.slice(0, 9), rest.slice(9, 18), rest.slice(18, 27), rest.slice(27, 36), rest.slice(36, 44), rest.slice(44)],
    cells: Array(4).fill(null),
    foundations: games.suits.map((suit) => ({ suit, cards: [] })),
    selected: { zone: "tableau", column: 0 },
    moves: 0,
    won: false,
  };
  const illegal = structuredClone(state);
  illegal.tableau[1] = [card("spades", 8)];
  assert.equal(games.moveFreecellCard(illegal, { zone: "tableau", column: 1 }), false);
  assert.equal(illegal.tableau[0][0].id, moving.id);
  assert.equal(games.moveFreecellCard(state, { zone: "tableau", column: 1 }), true);
  assert.equal(state.tableau[1].at(-1).id, moving.id);
  assert.equal(games.normalizeFreecell(state).tableau.flat().length, 52);

  state.selected = { zone: "tableau", column: 1 };
  assert.equal(games.moveFreecellCard(state, { zone: "cell", index: 0 }), true);
  assert.equal(state.cells[0].id, moving.id);
});

test("FreeCell moves a legal descending run only when the free-cell capacity allows it", () => {
  const card = (suit, rank) => ({ id: `${suit}-${rank}`, suit, rank, faceUp: true });
  const run = [card("clubs", 7), card("hearts", 6)];
  const base = {
    tableau: [[...run], [card("hearts", 8)], [card("diamonds", 10)], [card("clubs", 10)],
      [card("hearts", 10)], [card("spades", 10)], [card("diamonds", 9)], [card("clubs", 9)]],
    cells: Array(4).fill(null),
    foundations: games.suits.map((suit) => ({ suit, cards: [] })),
    selected: { zone: "tableau", column: 0, index: 0 },
    moves: 0,
    won: false,
  };
  assert.equal(games.moveFreecellCard(base, { zone: "tableau", column: 1 }), true);
  assert.deepEqual(base.tableau[1].map((entry) => entry.id), ["hearts-8", "clubs-7", "hearts-6"]);

  const blocked = structuredClone(base);
  blocked.tableau[0] = [card("clubs", 7), card("hearts", 6)];
  blocked.tableau[1] = [card("hearts", 8)];
  blocked.cells = Array(4).fill(card("diamonds", 3));
  blocked.selected = { zone: "tableau", column: 0, index: 0 };
  assert.equal(games.moveFreecellCard(blocked, { zone: "tableau", column: 1 }), false);
  assert.equal(blocked.tableau[0].length, 2);
});

test("Blackjack supports one to six bots, ace scoring, and settled rounds", () => {
  assert.equal(games.blackjackScore([{ rank: 1 }, { rank: 9 }, { rank: 1 }]), 21);
  assert.equal(games.blackjackScore([{ rank: 1 }, { rank: 9 }, { rank: 8 }]), 18);

  const game = games.createBlackjackGame(6, () => 0.37);
  assert.equal(game.players.length, 7);
  assert.equal(game.botCount, 6);
  assert.equal([...game.deck, ...game.dealer.hand, ...game.players.flatMap((player) => player.hand)].length, 52);
  assert.equal(games.standBlackjack(game), true);
  assert.equal(game.status, "settled");
  assert.ok(game.players.every((player) => ["win", "loss", "push", "bust"].includes(player.result)));
  assert.equal(games.normalizeBlackjack(game).players.length, 7);
});

test("Blackjack distinguishes naturals from other 21s and bots hit soft 17", () => {
  const game = {
    deck: [{ id: "spades-2", suit: "spades", rank: 2 }],
    players: [
      { id: "you", name: "You", human: true, hand: [{ rank: 1 }, { rank: 13 }], result: "" },
      { id: "bot-1", name: "Bot 1", human: false, hand: [{ rank: 1 }, { rank: 6 }], result: "" },
    ],
    dealer: { hand: [{ rank: 10 }, { rank: 6 }, { rank: 5 }] },
    status: "playing",
    result: "",
  };
  assert.equal(games.standBlackjack(game), true);
  assert.equal(game.players[0].result, "blackjack");
  assert.equal(game.players[1].hand.length, 3);
  assert.equal(games.blackjackNatural([{ rank: 1 }, { rank: 10 }]), true);
  assert.equal(games.blackjackNatural([{ rank: 1 }, { rank: 5 }, { rank: 5 }]), false);
});

test("Mini golf validates turns, scores holes, advances bots, and normalizes saved games", () => {
  const game = games.createMiniGolfGame(2);
  assert.equal(game.players.length, 3);
  assert.equal(games.playMiniGolfShot(game, { power: 41, angle: 0 }, () => 0), true);
  assert.equal(game.players[0].scores.length, 1);
  assert.equal(game.players[0].scores[0], 1);
  assert.equal(game.hole, 2);
  assert.equal(game.currentPlayer, 0);
  assert.match(game.lastShot, /finished hole 1\./);
  assert.equal(games.normalizeMiniGolf(game).players.length, 3);

  const corrupted = structuredClone(game);
  corrupted.players[0].total = -1;
  assert.equal(games.normalizeMiniGolf(corrupted), null);
});

test("Go Fish timer handles valid deadlines and expired turns", () => {
  const now = Date.parse("2026-11-25T12:00:00Z");
  assert.equal(games.goFishSecondsRemaining("2026-11-25T12:01:00Z", now), 60);
  assert.equal(games.goFishSecondsRemaining("2026-11-25T12:00:00.001Z", now), 1);
  assert.equal(games.goFishSecondsRemaining("2026-11-25T11:59:59Z", now), 0);
  assert.equal(games.goFishSecondsRemaining(null, now), null);
});
