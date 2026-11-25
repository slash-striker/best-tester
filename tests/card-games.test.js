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
