/*
 * Snake simulation — pure game rules, no rendering, no Phaser.
 * The Phaser scene only reads this state and forwards input into it.
 */
(function (global) {
  'use strict';

  var VECTORS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  var BASE_INTERVAL = 450; // ms per grid step at speed level 1
  var MIN_INTERVAL = 220;
  var STEP_BY_EATEN = 4;

  function SnakeSimulation(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.reset();
  }

  SnakeSimulation.prototype.reset = function () {
    var cx = Math.floor(this.cols / 2);
    var cy = Math.floor(this.rows / 2);

    // Head first: [head, body, tail]
    this.body = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy }
    ];
    this.direction = VECTORS.right;
    this.pending = [];
    this.score = 0;
    this.eaten = 0;
    this.alive = true;
    this.won = false;
    this.food = null;
    this.spawnFood();
    return this;
  };

  Object.defineProperty(SnakeSimulation.prototype, 'length', {
    get: function () { return this.body.length; }
  });

  Object.defineProperty(SnakeSimulation.prototype, 'speedLevel', {
    get: function () { return 1 + Math.floor(this.eaten / STEP_BY_EATEN); }
  });

  Object.defineProperty(SnakeSimulation.prototype, 'interval', {
    get: function () {
      return Math.max(MIN_INTERVAL, BASE_INTERVAL - this.eaten * (STEP_BY_EATEN + 1));
    }
  });

  SnakeSimulation.prototype.setDirection = function (name) {
    var next = VECTORS[name];
    if (!next || !this.alive) return false;

    // Compare against the last queued turn so fast double taps stay valid.
    var last = this.pending.length ? this.pending[this.pending.length - 1] : this.direction;
    if (next.x === -last.x && next.y === -last.y) return false;
    if (next.x === last.x && next.y === last.y) return false;
    if (this.pending.length >= 2) return false;

    this.pending.push(next);
    return true;
  };

  SnakeSimulation.prototype.occupies = function (x, y, ignoreIndex) {
    for (var i = 0; i < this.body.length; i++) {
      if (i === ignoreIndex) continue;
      if (this.body[i].x === x && this.body[i].y === y) return true;
    }
    return false;
  };

  SnakeSimulation.prototype.spawnFood = function () {
    var free = [];
    for (var y = 0; y < this.rows; y++) {
      for (var x = 0; x < this.cols; x++) {
        if (!this.occupies(x, y)) free.push({ x: x, y: y });
      }
    }
    if (!free.length) {
      this.food = null;
      this.won = true;
      this.alive = false;
      return;
    }
    this.food = free[Math.floor(Math.random() * free.length)];
  };

  /**
   * Advance the snake one grid cell.
   * @returns {'move'|'eat'|'dead'|'idle'}
   */
  SnakeSimulation.prototype.step = function () {
    if (!this.alive) return 'dead';

    if (this.pending.length) {
      this.direction = this.pending.shift();
    }

    var head = this.body[0];
    var nx = head.x + this.direction.x;
    var ny = head.y + this.direction.y;

    if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) {
      this.alive = false;
      return 'dead';
    }

    var eating = !!this.food && nx === this.food.x && ny === this.food.y;

    // The tail cell frees up this step unless the snake is growing.
    var limit = eating ? this.body.length : this.body.length - 1;
    for (var i = 0; i < limit; i++) {
      if (this.body[i].x === nx && this.body[i].y === ny) {
        this.alive = false;
        return 'dead';
      }
    }

    this.body.unshift({ x: nx, y: ny });

    if (eating) {
      this.eaten += 1;
      this.score += 10;
      this.spawnFood();
      return 'eat';
    }

    this.body.pop();
    return 'move';
  };

  global.SnakeSimulation = SnakeSimulation;
})(window);
