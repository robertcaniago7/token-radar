// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the fitted
// model's own inputs and the protocol's costed farm plan, plus a model sandbox that recomputes
// implied values live. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', verdict: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  // Sandbox overrides: null means the fitted model as shipped; a number replaces that constant.
  var sandbox = { growth_weight: null, maturity_floor: null, base_mult: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtPerHour(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toFixed(0) + '/h';
  }

  // The fitted curve, recomputed in the page from the snapshot figures, so the page's code and the
  // board's data are visibly the same arithmetic. Sandbox sliders replace the constants they name.
  function impliedOf(row, model, fit) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var gw = sandbox.growth_weight === null ? model.growth_weight : sandbox.growth_weight;
    var growthMult = 1 + (growth / 100) * gw;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var mf = sandbox.maturity_floor === null ? model.maturity_floor : sandbox.maturity_floor;
    var maturity = mf + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var base = Math.exp(fit.intercept) * Math.pow(row.tvl_usd, fit.slope);
    if (sandbox.base_mult !== null) base = base * sandbox.base_mult;
    return Math.max(1, Math.round(base * growthMult * maturity));
  }
  function sandboxActive() {
    return sandbox.growth_weight !== null || sandbox.maturity_floor !== null || sandbox.base_mult !== null;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('verdict')) state.verdict = params.get('verdict');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // Rows with the sandbox applied: implied values recomputed, ranks re-derived by that order.
  function viewRows() {
    var list = DATA.rows.map(function (r) {
      var copy = {};
      for (var k in r) copy[k] = r[k];
      copy.implied_value_usd = sandboxActive() ? impliedOf(r, DATA.model, DATA.fit) : r.implied_value_usd;
      return copy;
    });
    list.sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0); });
    list.forEach(function (r, i) { r.rank = i + 1; });
    return list;
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return viewRows().filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'net') { av = a.net_usd_per_hour; bv = b.net_usd_per_hour; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var fit = DATA.fit;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a fitted model, not a promise.' })
      ),
      el('div', { class: 'kpis' },
        el('div', { class: 'kpi' }, el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('span', { text: 'Watchlist covered' })),
        el('div', { class: 'kpi' }, el('b', { text: String(DATA.board_size) }), el('span', { text: 'Pre-token rows scored' })),
        el('div', { class: 'kpi' }, el('b', { text: fmtUsd(DATA.total_implied_usd) }), el('span', { text: 'Total implied value' })),
        el('div', { class: 'kpi' }, el('b', { text: 'R2 ' + fit.r_squared }), el('span', { text: 'Power-law fit on ' + fit.n_live + ' live tokens' })),
        el('div', { class: 'kpi' }, el('b', { text: 'x' + Math.exp(fit.cv_median_log_error).toFixed(2) }), el('span', { text: 'Median backtest error (5-fold)' })),
        el('div', { class: 'kpi' }, el('b', { text: String(DATA.live_size) }), el('span', { text: 'Live-token protocols set aside' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var verdict = el('select', { id: 'verdict', 'aria-label': 'Filter by farm verdict' },
      el('option', { value: 'all', text: 'All verdicts' }),
      ['Farm', 'Thin', 'Skip'].map(function (v) { return el('option', { value: v, text: v, selected: v === state.verdict ? 'selected' : null }); })
    );
    verdict.addEventListener('change', function () { state.verdict = verdict.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Farm verdict' }), verdict),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.verdict = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var netClass = r.net_usd_per_hour >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num ' + netClass, text: fmtPerHour(r.net_usd_per_hour) }),
        el('td', null, el('span', { class: 'verdict ' + r.verdict.toLowerCase(), text: r.verdict }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' + (sandboxActive() ? ' Sandbox is on: ranks are recomputed from your sliders, board.json is unchanged.' : '') }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('net', 'Net $/h'),
            el('th', { scope: 'col', text: 'Verdict' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var f = DATA.fit;
    var sandboxNote = sandboxActive() ? ' Sandbox is on: the board above is recomputed from your sliders. Reset to see the shipped model.' : '';
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'A power law fitted to the live tokens in this snapshot, not a multiple carried in. log(market cap) = ' + f.intercept + ' + ' + f.slope + ' x log(TVL), fitted on ' + f.n_live + ' live tokens (R2 ' + f.r_squared + '). 5-fold backtest: median error x' + Math.exp(f.cv_median_log_error).toFixed(2) + ', ' + Math.round(f.cv_within_2x * 100) + '% within 2x, ' + Math.round(f.cv_within_3x * 100) + '% within 3x. No protocol name is special-cased.' }),
      el('div', { class: 'formula' },
        'implied = round( exp(' + f.intercept + ') x tvl_usd ^ ' + f.slope + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Wrapped, staked and bridged products of tokens that already trade are excluded before ranking. The farm verdict assumes 10% of the implied value reaches the community, one farmer takes deposit / (deposit + $1,000,000) of it, and the chance the token launches and the farmer qualifies is 0.35; gas and hours are counted.' + sandboxNote }),
      el('div', { class: 'sandbox' },
        el('div', { class: 'field' },
          el('label', { for: 'sb-growth', text: 'Growth weight' }),
          el('input', { type: 'range', id: 'sb-growth', min: '0', max: '1', step: '0.05', value: sandbox.growth_weight === null ? String(m.growth_weight) : String(sandbox.growth_weight) }),
          el('output', { id: 'sb-growth-out', text: sandbox.growth_weight === null ? String(m.growth_weight) : String(sandbox.growth_weight) })
        ),
        el('div', { class: 'field' },
          el('label', { for: 'sb-maturity', text: 'Maturity floor' }),
          el('input', { type: 'range', id: 'sb-maturity', min: '0.4', max: '0.8', step: '0.05', value: sandbox.maturity_floor === null ? String(m.maturity_floor) : String(sandbox.maturity_floor) }),
          el('output', { id: 'sb-maturity-out', text: sandbox.maturity_floor === null ? String(m.maturity_floor) : String(sandbox.maturity_floor) })
        ),
        el('div', { class: 'field' },
          el('label', { for: 'sb-base', text: 'Base multiplier' }),
          el('input', { type: 'range', id: 'sb-base', min: '0.5', max: '2', step: '0.1', value: sandbox.base_mult === null ? '1' : String(sandbox.base_mult) }),
          el('output', { id: 'sb-base-out', text: sandbox.base_mult === null ? '1' : String(sandbox.base_mult) })
        )
      ),
      el('div', null,
        el('button', { class: 'button', type: 'button', text: 'Reset sandbox', onclick: function () { sandbox.growth_weight = null; sandbox.maturity_floor = null; sandbox.base_mult = null; render(); } })
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = row.farm_steps || [];
    // The detail recomputes this row under the sandbox, so the numbers shown match the board.
    var shownImplied = sandboxActive() ? impliedOf(row, DATA.model, DATA.fit) : row.implied_value_usd;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(shownImplied) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model, DATA.fit)) + (impliedOf(row, DATA.model, DATA.fit) === row.implied_value_usd ? ', the same number board.json carries.' : ' under the sandbox; board.json carries ' + fmtUsd(row.implied_value_usd) + '.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics' }),
      el('div', { class: 'econ' },
        el('div', null, el('b', { text: '$' + row.deposit_usd }), el('span', { text: 'Deposit' })),
        el('div', null, el('b', { text: fmtPerHour(row.net_usd_per_hour) }), el('span', { text: 'Net per hour' })),
        el('div', null, el('b', { text: row.verdict }), el('span', { text: 'Verdict' }))
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    // Wire the sandbox sliders after the panel exists.
    var gw = document.getElementById('sb-growth');
    if (gw) gw.addEventListener('input', function () { sandbox.growth_weight = parseFloat(gw.value); document.getElementById('sb-growth-out').textContent = gw.value; render(); });
    var mf = document.getElementById('sb-maturity');
    if (mf) mf.addEventListener('input', function () { sandbox.maturity_floor = parseFloat(mf.value); document.getElementById('sb-maturity-out').textContent = mf.value; render(); });
    var bm = document.getElementById('sb-base');
    if (bm) bm.addEventListener('input', function () { sandbox.base_mult = parseFloat(bm.value); document.getElementById('sb-base-out').textContent = bm.value; render(); });
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
