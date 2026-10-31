/*
 * Presentation layer: Phaser scene + DOM HUD/overlays.
 * The scene only renders simulation state and forwards input into it.
 */
(function () {
  'use strict';

  var COLS = 10;
  var ROWS = 10;
  var CELL = 52;
  var BEST_KEY = 'snake.best.v1';

  var GRID = 0xe9ebee;

  var HEAD_KEY = 'face-head';
  var BODY_KEYS = [];

  var els = {
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    overlay: document.getElementById('overlay')
  };

  var scene = null;

  function readBest() {
    try { return parseInt(window.localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
  }

  function writeBest(value) {
    try { window.localStorage.setItem(BEST_KEY, String(value)); } catch (e) { /* ignore */ }
  }

  var best = readBest();

  /* --------------------------------------------------------------- overlay */

  var Overlay = {
    show: function (html) {
      els.overlay.innerHTML = html;
      els.overlay.classList.add('is-open');
    },
    hide: function () {
      els.overlay.classList.remove('is-open');
      els.overlay.innerHTML = '';
    },
    showStart: function () {
      this.show(
        '<div class="panel">' +
          '<h1 class="panel-title">贪吃蛇</h1>' +
          '<p class="panel-hint">方向键 / WASD / 下方按钮控制<br>吃到校徽得分，撞墙或撞到自己结束</p>' +
          '<button class="btn" data-action="start">开始游戏</button>' +
        '</div>'
      );
    },
    showPause: function () {
      this.show(
        '<div class="panel">' +
          '<h1 class="panel-title">已暂停</h1>' +
          '<button class="btn" data-action="resume">继续游戏</button>' +
        '</div>'
      );
    },
    showGameOver: function (score) {
      this.show(
        '<div class="panel">' +
          '<h1 class="panel-title">游戏结束</h1>' +
          '<p class="panel-result">本局得分 <b>' + score + '</b></p>' +
          '<button class="btn" data-action="restart">再来一局</button>' +
        '</div>'
      );
    }
  };

  els.overlay.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-action]');
    if (!btn || !scene) return;
    var action = btn.getAttribute('data-action');
    if (action === 'start' || action === 'restart') scene.startGame();
    else if (action === 'resume') scene.togglePause();
  });

  /* ------------------------------------------------------------ direction */

  function pushDirection(name) {
    if (!scene) return;
    if (scene.state === 'ready') scene.startGame();
    if (scene.state === 'playing') scene.sim.setDirection(name);
  }

  Array.prototype.forEach.call(document.querySelectorAll('.pad'), function (btn) {
    var dir = btn.getAttribute('data-dir');

    btn.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      btn.classList.add('is-pressed');
      pushDirection(dir);
    });

    btn.addEventListener('pointerup', function () { btn.classList.remove('is-pressed'); });
    btn.addEventListener('pointerleave', function () { btn.classList.remove('is-pressed'); });
    btn.addEventListener('pointercancel', function () { btn.classList.remove('is-pressed'); });

    // Keyboard activation (Enter/Space) fires click with detail 0.
    btn.addEventListener('click', function (event) {
      if (event.detail === 0) pushDirection(dir);
    });
  });

  /* ---------------------------------------------------------------- scene */

  function GameScene() {
    Phaser.Scene.call(this, { key: 'GameScene' });
  }

  GameScene.prototype = Object.create(Phaser.Scene.prototype);
  GameScene.prototype.constructor = GameScene;

  GameScene.prototype.preload = function () {
    this.load.image('food', window.FOOD_TEXTURE);
    this.load.image(HEAD_KEY, window.FACE_TEXTURES.head);
    for (var i = 0; i < window.FACE_TEXTURES.body.length; i++) {
      var key = 'face-body-' + i;
      BODY_KEYS.push(key);
      this.load.image(key, window.FACE_TEXTURES.body[i]);
    }
  };

  GameScene.prototype.create = function () {
    scene = this;

    this.sim = new SnakeSimulation(COLS, ROWS);
    this.state = 'ready';
    this.acc = 0;
    this.deathAt = -9999;

    this.grid = this.add.graphics();
    this.bodyViews = [];
    this.headView = this.add.image(0, 0, HEAD_KEY).setDepth(2).setVisible(false);
    this.foodSprite = this.add.image(0, 0, 'food').setDepth(3).setVisible(false);
    this.resetTextures();

    this.drawGrid();
    this.bindKeyboard();

    els.best.textContent = best;
    this.syncHud();
    Overlay.showStart();
    this.draw(this.time.now);
  };

  GameScene.prototype.randomBodyKey = function () {
    return BODY_KEYS[Math.floor(Math.random() * BODY_KEYS.length)];
  };

  // One face texture per body cell, index-aligned with sim.body[1..].
  GameScene.prototype.resetTextures = function () {
    this.segTextures = [];
    for (var i = 1; i < this.sim.body.length; i++) this.segTextures.push(this.randomBodyKey());
  };

  GameScene.prototype.drawGrid = function () {
    var g = this.grid;
    g.clear();
    g.lineStyle(1, GRID, 1);
    for (var x = 1; x < COLS; x++) g.lineBetween(x * CELL, 0, x * CELL, ROWS * CELL);
    for (var y = 1; y < ROWS; y++) g.lineBetween(0, y * CELL, COLS * CELL, y * CELL);
  };

  GameScene.prototype.bindKeyboard = function () {
    var kb = this.input.keyboard;
    kb.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'W', 'A', 'S', 'D', 'P', 'ENTER']);
    kb.on('keydown', this.onKey, this);
  };

  GameScene.prototype.onKey = function (event) {
    var dirs = {
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right'
    };

    if (dirs[event.code]) {
      pushDirection(dirs[event.code]);
      return;
    }

    if (event.code === 'Space' || event.code === 'KeyP') {
      if (this.state === 'ready' || this.state === 'dead') this.startGame();
      else this.togglePause();
      return;
    }

    if (event.code === 'Enter' && (this.state === 'dead' || this.state === 'ready')) {
      this.startGame();
    }
  };

  GameScene.prototype.startGame = function () {
    this.sim.reset();
    this.resetTextures();
    this.acc = 0;
    this.deathAt = -9999;
    this.state = 'playing';
    this.syncHud();
    Overlay.hide();
  };

  GameScene.prototype.togglePause = function () {
    if (this.state === 'playing') {
      this.state = 'paused';
      Overlay.showPause();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      Overlay.hide();
    }
  };

  GameScene.prototype.syncHud = function () {
    els.score.textContent = this.sim.score;
  };

  GameScene.prototype.onDeath = function () {
    this.state = 'dead';
    this.deathAt = this.time.now;

    if (this.sim.score > best) {
      best = this.sim.score;
      writeBest(best);
      els.best.textContent = best;
    }

    var self = this;
    this.time.delayedCall(520, function () {
      if (self.state === 'dead') Overlay.showGameOver(self.sim.score);
    });
  };

  GameScene.prototype.update = function (time, delta) {
    if (this.state === 'playing') {
      this.acc += delta;
      var guard = 0;

      while (this.state === 'playing' && this.acc >= this.sim.interval && guard < 4) {
        this.acc -= this.sim.interval;
        guard += 1;

        var result = this.sim.step();
        if (result === 'eat') {
          // A new body segment appears right behind the head: give it a random face.
          this.segTextures.unshift(this.randomBodyKey());
          this.syncHud();
        } else if (result === 'dead') {
          this.onDeath();
        }
      }
    }

    this.draw(time);
  };

  GameScene.prototype.draw = function (time) {
    var sim = this.sim;
    var body = sim.body;
    var alpha = 1;

    if (this.state === 'dead') {
      var since = time - this.deathAt;
      if (since < 560) alpha = 0.2 + 0.8 * Math.abs(Math.sin(since / 60));
    }

    if (sim.food) {
      var pulse = 1 + 0.05 * Math.sin(time / 220);
      var size = CELL * 1.2 * pulse;
      this.foodSprite.setVisible(true);
      this.foodSprite.setDisplaySize(size, size);
      this.foodSprite.setPosition(
        sim.food.x * CELL + CELL / 2,
        sim.food.y * CELL + CELL / 2 + Math.sin(time / 300) * 1.4
      );
    } else {
      this.foodSprite.setVisible(false);
    }

    for (var i = 1; i < body.length; i++) {
      var view = this.bodyViews[i - 1];
      if (!view) {
        view = this.add.image(0, 0, HEAD_KEY).setDepth(1);
        this.bodyViews[i - 1] = view;
      }
      view.setTexture(this.segTextures[i - 1] || HEAD_KEY);
      view.setDisplaySize(CELL * 1.0, CELL * 1.0);
      view.setPosition(body[i].x * CELL + CELL / 2, body[i].y * CELL + CELL / 2);
      view.setAlpha(alpha);
      view.setVisible(true);
      // Segments closer to the head draw on top of the ones behind them.
      view.setDepth(1 + (body.length - i) * 0.01);
    }

    // Hide leftovers when the snake is shorter than the previous frame.
    for (var j = body.length - 1; j < this.bodyViews.length; j++) {
      this.bodyViews[j].setVisible(false);
    }

    var dir = sim.direction;
    this.headView.setVisible(true);
    this.headView.setDisplaySize(CELL * 1.2, CELL * 1.2);
    this.headView.setPosition(
      body[0].x * CELL + CELL / 2 + dir.x * CELL * 0.05,
      body[0].y * CELL + CELL / 2 + dir.y * CELL * 0.05
    );
    this.headView.setAlpha(alpha);
  };

  /* ----------------------------------------------------------------- boot */

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: COLS * CELL,
    height: ROWS * CELL,
    backgroundColor: '#ffffff',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    render: { roundPixels: true },
    scene: [GameScene]
  });
})();
