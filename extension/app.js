'use strict';

(function () {
  const MAX_BARS = 200;
  const MAX_HISTORY_MARKS = 1000;
  const MAX_SOURCE_ROWS = 5000;
  const SETTINGS_PREFIX = 'p3d-';
  let workbookSettings = {};
  let workbookSettingsReady = false;
  let settingsSaveTimer = null;
  let applySettingsPanelState = () => {};
  let applyPagesPanelState = () => {};
  const palettes = {
    tableau: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'],
    ocean: ['#075985', '#0284c7', '#06b6d4', '#14b8a6', '#67e8f9', '#155e75'],
    sunset: ['#7c2d12', '#c2410c', '#ea580c', '#f59e0b', '#facc15', '#be123c'],
    mono: ['#164e63', '#28677a', '#3e8090', '#5b99a5', '#7bb2ba', '#a3cbd0']
  };

  const sampleRows = [
    { category: 'Furniture', depth: 'East', color: 'East', value: 55 },
    { category: 'Office Supplies', depth: 'East', color: 'East', value: 82 },
    { category: 'Technology', depth: 'East', color: 'East', value: 118 },
    { category: 'Furniture', depth: 'West', color: 'West', value: 72 },
    { category: 'Office Supplies', depth: 'West', color: 'West', value: 106 },
    { category: 'Technology', depth: 'West', color: 'West', value: 145 }
  ];


  const manualOrder = { x: [], z: [] };
  const layoutDefaults = { 'layout-top': '24', 'layout-bottom': '54', 'layout-left': '82', 'layout-right': '48', 'legend-position': 'inside-right', 'legend-x': '0', 'legend-y': '0' };
  const layoutIds = Object.keys(layoutDefaults);
  const backgroundDefaults = { 'header-mode': 'full', 'background-mode': 'solid', 'background-color': '#f7fafc', 'background-opacity': '100', 'label-halo': 'white' };
  const backgroundIds = Object.keys(backgroundDefaults);
  const appearanceIds = ['shape','snack-style','snack-profile','snack-chocolate-mode','snack-chocolate-color','snack-biscuit-color','snack-chocolate-ratio','snack-width','snack-coating-thickness','snack-crunch-intensity','snack-gloss',...backgroundIds,'plane-mode','plane-color','negative-floor-mode','axis-line-mode','axis-line-color','axis-line-width','frame-line-mode','frame-line-color','frame-line-width','filter-axis-mode','stack-mode','stack-order','stack-label','table-calc','calc-direction','calc-partition','calc-window','trend-show','trend-x-mode','trend-partition','trend-color-mode','trend-color','trend-style','trend-width','trend-stats','history-mode','history-count','history-fade','trajectory-show','trajectory-break-wrap','trajectory-style','trajectory-color','trajectory-width',
    'stem-show','stem-style','stem-color-mode','stem-color','stem-width','stem-opacity','stem-history',
    ...['grid','guide'].flatMap(k => [k+'-style',k+'-color',k+'-width']),
    ...['x','y','z'].flatMap(k => [k+'-title-pos',k+'-angle', ...['title','tick'].flatMap(p => [k+'-'+p+'-x',k+'-'+p+'-y'])]), 'x-sort','z-sort', ...layoutIds];
  const setting = id => document.getElementById(id).value;
  const storedSetting = key => Object.prototype.hasOwnProperty.call(workbookSettings, key) ? workbookSettings[key] : null;
  function scheduleSettingsSave () {
    if (!workbookSettingsReady || !window.tableau?.extensions?.settings) return;
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = setTimeout(() => {
      tableau.extensions.settings.saveAsync().catch(() => {
        showMessage('Could not save settings to the workbook. Settings may revert after reloading.');
      });
    }, 250);
  }
  function persistSetting (key, value) {
    const text = String(value);
    workbookSettings[key] = text;
    if (!workbookSettingsReady || !window.tableau?.extensions?.settings) return;
    tableau.extensions.settings.set(key, text);
    scheduleSettingsSave();
  }
  function activateWorkbookSettings () {
    workbookSettings = { ...tableau.extensions.settings.getAll() };
    workbookSettingsReady = true;
  }
  function controlStoredValue (element) {
    return element.type === 'checkbox' ? String(element.checked) : element.value;
  }
  function restoreControl (id, fallback) {
    const element = document.getElementById(id);
    if (!element) return;
    const saved = storedSetting(SETTINGS_PREFIX + id);
    const value = saved == null ? fallback : saved;
    if (value == null) return;
    if (element.type === 'checkbox') element.checked = value === true || value === 'true';
    else element.value = String(value);
  }
  function saveControl (id) {
    const element = document.getElementById(id);
    if (element) persistSetting(SETTINGS_PREFIX + id, controlStoredValue(element));
  }
  const amount = id => Math.max(-80, Math.min(80, Number(setting(id)) || 0));
  function axisMembers(model, key, axis) {
    const values = unique(model.rows.map(r => r[key]));
    const mode = setting(axis+'-sort');
    const totals = new Map(values.map(v => [v, 0]));
    for (const row of model.rows) totals.set(row[key], totals.get(row[key]) + row.value);
    const compare = (a,b) => a.localeCompare(b,'ja',{numeric:true});
    if (mode==='manual') {
      manualOrder[axis] = [...manualOrder[axis].filter(v=>values.includes(v)), ...values.filter(v=>!manualOrder[axis].includes(v))];
      return manualOrder[axis].slice();
    }
    if (mode==='source') return values;
    return values.sort((a,b)=>(mode.startsWith('value-') ? totals.get(a)-totals.get(b) || compare(a,b) : compare(a,b)) * (mode.endsWith('desc')?-1:1));
  }
  function memberControl(axis, values) {
    const select=document.getElementById(axis+'-member'), previous=select.value;
    select.replaceChildren();
    values.forEach(v=>{ const o=document.createElement('option');o.value=v;o.textContent=v;select.appendChild(o); });
    select.value=values.includes(previous)?previous:values[0];
  }
  function decorateChart(svg) {
    const walk = node => {
      const cls=node.getAttribute('class') || '';
      if (['floor','lower-floor','side-wall','back-wall'].includes(cls)) {
        const transparent=setting('plane-mode')==='transparent' || (cls==='lower-floor' && setting('negative-floor-mode')==='grid');
        node.style.fill=transparent?'none':setting('plane-color');node.style.fillOpacity=transparent?'0':'0.65';node.style.opacity='1';
        node.style.stroke=setting('frame-line-mode')==='hidden'?'none':setting('frame-line-color');
        node.style.strokeWidth=setting('frame-line-width');
      }
      if (cls.split(/\s+/).includes('axis')) {
        node.style.display=setting('axis-line-mode')==='hidden'?'none':'';
        node.style.stroke=setting('axis-line-color');
        node.style.strokeWidth=setting('axis-line-width');
      }
      if (cls==='projection-guides' && setting('guide-style')==='none') node.style.display='none';
      if ((cls==='axis-guide-dot'||cls==='axis-guide-value'||cls==='value-label axis-guide-value') && setting('guide-style')==='none')node.style.display='none';
      const kind=cls.includes('projection-line')?'guide': /(^| )(grid|wall-grid|floor-grid)( |$)/.test(cls)?'grid':null;
      if (kind) {
        const mode=setting(kind+'-style');
        node.style.stroke=setting(kind+'-color');node.style.strokeWidth=setting(kind+'-width');
        node.style.strokeDasharray=mode==='dot'?'1 4':mode==='dash'?'6 4':'none';
        node.style.strokeLinecap='round';node.style.opacity=kind==='grid'?'0.65':'0.9';
        if(mode==='none')node.style.display='none';
      }
      const axis=node.getAttribute('data-axis'), part=node.getAttribute('data-part');
      if(axis) {
        const x=Number(node.getAttribute('x')), y=Number(node.getAttribute('y'));
        node.setAttribute('transform',`translate(${amount(axis+'-'+part+'-x')} ${amount(axis+'-'+part+'-y')}) rotate(${part==='tick'?amount(axis+'-angle'):0} ${x} ${y})`);
        if(part==='title' && setting(axis+'-title-pos')==='hidden')node.style.display='none';
      }
      for(const child of node.children)walk(child);
    };walk(svg);
  }
  function axisText(g,x,y,text,cls,anchor,axis,part) {
    const node=textEl(x,y,text,cls,anchor);node.setAttribute('data-axis',axis);node.setAttribute('data-part',part);g.appendChild(node);return node;
  }
  function trajectorySegments (track, categoryCount, breakAtWrap) {
    if (!breakAtWrap || track.length < 2) return [track];
    const segments = [[]];
    const wrapThreshold = Math.max(1, categoryCount / 2);
    for (const item of track) {
      const segment = segments[segments.length - 1];
      const previous = segment[segment.length - 1];
      if (previous && Math.abs(item.xi - previous.xi) > wrapThreshold) segments.push([]);
      segments[segments.length - 1].push(item);
    }
    return segments;
  }
  function linearRegression (points) {
    const valid = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (valid.length < 2) return null;
    const meanX = valid.reduce((sum, point) => sum + point.x, 0) / valid.length;
    const meanY = valid.reduce((sum, point) => sum + point.y, 0) / valid.length;
    const denominator = valid.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
    if (!denominator) return null;
    const slope = valid.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator;
    const intercept = meanY - slope * meanX;
    const total = valid.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
    const residual = valid.reduce((sum, point) => sum + (point.y - (slope * point.x + intercept)) ** 2, 0);
    const r2 = total ? Math.max(0, Math.min(1, 1 - residual / total)) : 1;
    return { slope, intercept, r2, count: valid.length };
  }
  function trendX (row, categories) {
    if (setting('trend-x-mode') === 'order') return { value: categories.indexOf(row.category), unit: 'item' };
    const raw = row.categoryRaw;
    if (typeof raw === 'number' && Number.isFinite(raw)) return { value: raw, unit: 'X' };
    if (raw instanceof Date && Number.isFinite(raw.getTime())) return { value: raw.getTime() / 31556952000, unit: 'year' };
    if (['date', 'datetime'].includes(row.categoryType)) {
      const time = Date.parse(raw);
      if (Number.isFinite(time)) return { value: time / 31556952000, unit: 'year' };
    }
    return { value: categories.indexOf(row.category), unit: 'item' };
  }
  function updateTrendControls () {
    const stacking = setting('stack-mode') === 'color' && ['bar','cylinder'].includes(setting('shape'));
    document.getElementById('trend-show').disabled = stacking;
    const enabled = document.getElementById('trend-show').checked && !stacking;
    for (const id of ['trend-x-mode','trend-partition','trend-color-mode','trend-style','trend-width','trend-stats']) document.getElementById(id).disabled = !enabled;
    document.getElementById('trend-color').disabled = !enabled || setting('trend-color-mode') !== 'fixed';
    document.getElementById('trend-note').textContent = enabled
      ? 'Runs a linear regression across the X axis for the currently displayed Page.' : stacking ? 'Trend lines are unavailable while stacking is enabled.' : 'Trend lines are hidden.';
  }
  function updateStemControls () {
    const enabled = setting('shape') === 'sphere' && document.getElementById('stem-show').checked;
    for (const id of ['stem-style','stem-color-mode','stem-width','stem-opacity','stem-history']) document.getElementById(id).disabled = !enabled;
    document.getElementById('stem-color').disabled = !enabled || setting('stem-color-mode') !== 'fixed';
  }
  function updateCalculationControls () {
    const mode = setting('table-calc');
    const enabled = mode !== 'none';
    document.getElementById('calc-direction').disabled = !enabled;
    document.getElementById('calc-partition').disabled = !enabled;
    document.getElementById('calc-window').disabled = mode !== 'moving-average';
    const direction = setting('calc-direction') === 'page' && !pages.length ? ' (X-axis order because Page is not configured)' : '';
    document.getElementById('calc-note').textContent = enabled
      ? 'Uses the calculated Y values for mark height, reference checks, and labels.' + direction
      : 'Uses the Y values received from Tableau as-is.';
  }

  function tableCalculation (model, categories) {
    const mode = setting('table-calc');
    if (mode === 'none') return model;
    const requestedDirection = setting('calc-direction');
    const direction = requestedDirection === 'page' && pages.length ? 'page' : 'x';
    const partition = setting('calc-partition');
    const windowSize = Math.max(1, Math.min(120, Number(setting('calc-window')) || 3));
    const categoryOrder = new Map(categories.map((value, index) => [value, index]));
    const pageOrder = new Map(pages.map((value, index) => [value, index]));
    const partitionKey = row => partition === 'all' ? ['all']
      : partition === 'z' ? [row.depth]
        : partition === 'color' ? [row.color] : [row.depth, row.color];
    const rows = model.rows.map((row, sourceIndex) => ({
      ...row,
      rawValue: Number.isFinite(row.rawValue) ? row.rawValue : row.value,
      rawValueText: row.rawValueText || row.valueText || compactNumber(row.value),
      _sourceIndex: sourceIndex
    }));
    const groups = new Map();
    for (const row of rows) {
      const key = JSON.stringify(direction === 'page'
        ? [...partitionKey(row), row.category]
        : [row.page, ...partitionKey(row)]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    for (const sequence of groups.values()) {
      sequence.sort((a, b) => direction === 'page'
        ? (pageOrder.get(a.page) ?? Number.MAX_SAFE_INTEGER) - (pageOrder.get(b.page) ?? Number.MAX_SAFE_INTEGER) || a._sourceIndex - b._sourceIndex
        : (categoryOrder.get(a.category) ?? Number.MAX_SAFE_INTEGER) - (categoryOrder.get(b.category) ?? Number.MAX_SAFE_INTEGER) || a._sourceIndex - b._sourceIndex);
      let running = 0;
      const window = [];
      for (const row of sequence) {
        running += row.rawValue;
        window.push(row.rawValue);
        if (window.length > windowSize) window.shift();
        row.value = mode === 'running-total' ? running : window.reduce((sum, value) => sum + value, 0) / window.length;
        row.valueText = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(row.value);
      }
    }
    for (const row of rows) delete row._sourceIndex;
    const name = mode === 'running-total' ? 'Running Total' : `Moving Average (${windowSize})`;
    return { ...model, rows, rawValueLabel: model.rawValueLabel || model.valueLabel, valueLabel: `${name}：${model.rawValueLabel || model.valueLabel}` };
  }

  function prepareStackRows (rows, colorKeys, active, order) {
    if (!active) return rows.map(row => ({ ...row, _stackBase: 0, _stackTotal: row.value, _stackLast: true }));
    const colorOrder = new Map(colorKeys.map((value, index) => [value, index]));
    const groups = new Map();
    for (const row of rows) {
      const key = JSON.stringify([row.page, row.category, row.depth]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const result = [];
    for (const group of groups.values()) {
      group.sort((a, b) => order === 'value-asc' ? a.value - b.value
        : order === 'value-desc' ? b.value - a.value
          : (colorOrder.get(a.color) ?? 9999) - (colorOrder.get(b.color) ?? 9999));
      const positiveRows = group.filter(row => row.value >= 0);
      const negativeRows = group.filter(row => row.value < 0);
      const positiveTotal = positiveRows.reduce((sum, row) => sum + row.value, 0);
      const negativeTotal = negativeRows.reduce((sum, row) => sum + row.value, 0);
      let positiveBase = 0;
      let negativeBase = 0;
      for (const row of group) {
        const positive = row.value >= 0;
        const base = positive ? positiveBase : negativeBase;
        const sideRows = positive ? positiveRows : negativeRows;
        const sideTotal = positive ? positiveTotal : negativeTotal;
        result.push({
          ...row,
          _stackBase: base,
          _stackTotal: sideTotal,
          _stackLast: row === sideRows[sideRows.length - 1]
        });
        if (positive) positiveBase += row.value; else negativeBase += row.value;
      }
    }
    return result;
  }

  let worksheet;
  function buildReferenceFields (names) {
    const select = document.getElementById('reference-source');
    const previous = select.value;
    select.replaceChildren();
    for (const [value, label] of [['off', 'Off'], ['fixed', 'Fixed value'], ...names.map(name => ['field:' + name, name])]) {
      const option = document.createElement('option');
      option.value = value; option.textContent = label; select.appendChild(option);
    }
    select.value = previous === 'fixed' || names.some(name => previous === 'field:' + name) ? previous : 'off';
  }
  function referenceValue (row) {
    const source = document.getElementById('reference-source').value;
    const raw = source === 'fixed' ? document.getElementById('reference-fixed').value
      : source.startsWith('field:') ? row.extraNumbers?.[source.slice(6)] : null;
    if (raw == null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
  function referenceMatches (row) {
    const target = referenceValue(row);
    if (target === null) return false;
    const actual = Number.isFinite(row._stackTotal) ? row._stackTotal : row.value;
    switch (document.getElementById('reference-op').value) {
      case 'ge': return actual >= target;
      case 'lt': return actual < target;
      case 'le': return actual <= target;
      default: return actual > target;
    }
  }
  function buildWidthFields (names) {
    const select = document.getElementById('width-field');
    const previous = select.value;
    select.replaceChildren();
    for (const name of ['', ...names]) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name || 'Select a field';
      select.appendChild(option);
    }
    select.value = names.includes(previous) ? previous : '';
    updateWidthControls();
  }
  function widthFieldValue (row) {
    const name = setting('width-field');
    if (!name) return null;
    const value = Number(row.extraNumbers?.[name]);
    return Number.isFinite(value) ? value : null;
  }
  function updateWidthControls () {
    const mode = setting('mark-width-mode');
    document.getElementById('width-fixed').disabled = mode !== 'fixed';
    document.getElementById('width-field').disabled = mode !== 'field';
    document.getElementById('width-min').disabled = mode !== 'field';
    document.getElementById('width-max').disabled = mode !== 'field';
    const field = setting('width-field');
    document.getElementById('width-note').textContent = mode === 'auto' ? 'Width: Auto'
      : mode === 'fixed' ? 'Width: Fixed ' + setting('width-fixed') + '%'
        : field ? 'Width: ' + field + ' (shared scale across all pages)' : 'Select a width field';
  }
  function buildDepthFields (names) {
    const select = document.getElementById('depth-field');
    const previous = select.value;
    select.replaceChildren();
    for (const name of ['', ...names]) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name || 'Select a field';
      select.appendChild(option);
    }
    select.value = names.includes(previous) ? previous : '';
    updateDepthControls();
  }
  function depthFieldValue (row) {
    const name = setting('depth-field');
    if (!name) return null;
    const value = Number(row.extraNumbers?.[name]);
    return Number.isFinite(value) ? value : null;
  }
  function updateDepthControls () {
    const sphere = setting('shape') === 'sphere';
    const mode = setting('mark-depth-mode');
    document.getElementById('mark-depth-mode').disabled = sphere;
    document.getElementById('depth-fixed').disabled = sphere || mode !== 'fixed';
    document.getElementById('depth-field').disabled = sphere || mode !== 'field';
    document.getElementById('depth-min').disabled = sphere || mode !== 'field';
    document.getElementById('depth-max').disabled = sphere || mode !== 'field';
    const field = setting('depth-field');
    document.getElementById('depth-note').textContent = sphere ? 'Sphere ignores depth settings to preserve aspect ratio'
      : mode === 'auto' ? 'Depth: Auto'
        : mode === 'fixed' ? 'Depth: Fixed ' + setting('depth-fixed') + '%'
          : field ? 'Depth: ' + field + ' (shared scale across all pages)' : 'Select a depth field';
  }
  function updateSnackControls () {
    const active = setting('shape') === 'snack';
    const style = setting('snack-style');
    document.getElementById('snack-style-control').hidden = !active;
    for (const id of ['snack-style','snack-profile','snack-chocolate-mode','snack-chocolate-color','snack-biscuit-color','snack-chocolate-ratio','snack-width','snack-coating-thickness','snack-crunch-intensity','snack-gloss']) {
      document.getElementById(id).disabled = !active;
    }
    document.getElementById('snack-coating-thickness').disabled = !active || style === 'classic';
    document.getElementById('snack-crunch-intensity').disabled = !active || style !== 'crunch';
    document.getElementById('snack-note').textContent = active
      ? style === 'classic' ? 'Classic: biscuit and chocolate use the same thickness'
        : style === 'thick-choco' ? 'Thick Choco: only the chocolate at the value end is thicker'
          : 'Crunch: overlays a lightweight crunchy dot texture on the thicker chocolate'
      : 'Available when Snack Stick is selected';
  }
  function updateReferenceControls () {
    const source = setting('reference-source');
    const active = source !== 'off';
    const style = setting('reference-style');
    document.getElementById('reference-fixed').disabled = source !== 'fixed';
    for (const id of ['reference-op','reference-style','reference-lines']) document.getElementById(id).disabled = !active;
    document.getElementById('reference-lighten').disabled = !active || style !== 'intensity';
    document.getElementById('reference-color').disabled = !active || !['outline','glow','fill'].includes(style);
    document.getElementById('reference-width').disabled = !active || !['outline','glow'].includes(style);
    document.getElementById('reference-line-color').disabled = !active || !document.getElementById('reference-lines').checked;
  }
  function updatePlaneGuideControls () {
    document.getElementById('plane-color').disabled = setting('plane-mode') === 'transparent';
    const gridEnabled = setting('grid-style') !== 'none';
    document.getElementById('grid-color').disabled = !gridEnabled;
    document.getElementById('grid-width').disabled = !gridEnabled;
    const guideEnabled = setting('guide-style') !== 'none';
    document.getElementById('guide-color').disabled = !guideEnabled;
    document.getElementById('guide-width').disabled = !guideEnabled;
    const axisEnabled = setting('axis-line-mode') !== 'hidden';
    document.getElementById('axis-line-color').disabled = !axisEnabled;
    document.getElementById('axis-line-width').disabled = !axisEnabled;
    const frameEnabled = setting('frame-line-mode') !== 'hidden';
    document.getElementById('frame-line-color').disabled = !frameEnabled;
    document.getElementById('frame-line-width').disabled = !frameEnabled;
  }
  function applyBackgroundAppearance () {
    const headerMode = setting('header-mode');
    const mode = setting('background-mode');
    const color = setting('background-color');
    const opacity = Math.max(10, Math.min(100, Number(setting('background-opacity')) || 100));
    const halo = setting('label-halo');
    document.body.dataset.headerMode = headerMode;
    document.body.dataset.backgroundMode = mode;
    document.body.style.setProperty('--app-background', color + Math.round(opacity / 100 * 255).toString(16).padStart(2, '0'));
    document.body.style.setProperty('--label-halo-color', halo === 'black' ? '#111827' : halo === 'none' ? 'transparent' : '#ffffff');
    document.body.style.setProperty('--label-halo-width', halo === 'none' ? '0px' : '3px');
    document.getElementById('background-color').disabled = mode !== 'solid';
    document.getElementById('background-opacity').disabled = mode !== 'solid';
    document.getElementById('background-opacity-value').textContent = opacity + '%';
    const recovery = document.getElementById('header-recovery');
    if (recovery) recovery.hidden = headerMode !== 'hidden';
  }
  function updateHistoryControls () {
    const enabled = setting('history-mode') !== 'none';
    for (const id of ['history-count','history-opacity','history-fade','trajectory-show']) document.getElementById(id).disabled = !enabled;
    const trajectory = enabled && document.getElementById('trajectory-show').checked;
    for (const id of ['trajectory-break-wrap','trajectory-style','trajectory-color','trajectory-width']) document.getElementById(id).disabled = !trajectory;
  }
  function updateStackControls () {
    const supported = ['bar','cylinder'].includes(setting('shape'));
    document.getElementById('stack-mode').disabled = !supported;
    const enabled = supported && setting('stack-mode') === 'color';
    document.getElementById('stack-order').disabled = !enabled;
    document.getElementById('stack-label').disabled = !enabled;
    document.getElementById('stack-note').textContent = supported
      ? enabled ? 'Stacks color series sharing the same X, Z, and Page' : 'Available for Rectangular Prism and Cylinder'
      : 'Stacking is unavailable for this shape';
    updateTrendControls();
  }
  let selectedColorField = '';

  function buildColorFields (names) {
    const select = document.getElementById('color-field');
    if (!names.includes(selectedColorField)) selectedColorField = '';
    select.replaceChildren();
    for (const name of ['', ...names]) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name || 'Auto (Z)';
      select.appendChild(option);
    }
    select.value = selectedColorField;
  }

  function applyColorField () {
    if (!lastModel) return;
    for (const row of lastModel.rows) row.color = selectedColorField ? row.extraColors[selectedColorField] : row.depth;
    lastModel.colorLabel = selectedColorField || lastModel.depthLabel;
    delete filters.color;
    highlighted = null;
    buildFilters();
    render(lastModel);
  }
  let lastModel = null;
  let redrawTimer;
  let filters = {};
  let highlighted = null;
  let pages = [], pageIndex = 0, playTimer = null, playing = false;
  let refreshVersion = 0;

  function applyPlaybackUiMode (mode) {
    const pagesPanel = document.getElementById('pages');
    const toggle = document.getElementById('page-ui-toggle');
    if (!pagesPanel || !toggle) return;
    const normalized = mode === 'advanced' ? 'advanced' : 'simple';
    pagesPanel.dataset.playbackUi = normalized;
    const advanced = normalized === 'advanced';
    toggle.textContent = advanced ? 'Simple' : 'Advanced';
    toggle.setAttribute('aria-pressed', String(advanced));
    toggle.title = advanced ? 'Show only basic playback settings' : 'Show advanced playback settings';
  }

  function restorePlaybackUiMode () {
    applyPlaybackUiMode(storedSetting(SETTINGS_PREFIX + 'page-ui-mode') || 'simple');
  }

  function stopPlayback () {
    clearTimeout(playTimer);
    playTimer = null;
    playing = false;
    document.getElementById('page-play').textContent = '▶ Play';
  }

  function updatePageControls () {
    const enabled = pages.length > 0;
    document.getElementById('page-hint').textContent = enabled ? lastModel.pageLabel : 'Add a field to Page on the Marks card to enable playback.';
    for (const id of ['page-select', 'page-slider', 'page-speed', 'page-loop', 'history-mode', 'history-count', 'history-opacity', 'history-fade', 'trajectory-show', 'trajectory-break-wrap', 'trajectory-style', 'trajectory-color', 'trajectory-width']) document.getElementById(id).disabled = !enabled;
    document.getElementById('page-play').disabled = pages.length < 2;
    document.getElementById('page-prev').disabled = !enabled || pageIndex === 0;
    document.getElementById('page-next').disabled = !enabled || pageIndex >= pages.length - 1;
    document.getElementById('page-select').value = String(pageIndex);
    document.getElementById('page-slider').max = String(Math.max(0, pages.length - 1));
    document.getElementById('page-slider').value = String(pageIndex);
    document.getElementById('page-position').textContent = enabled ? (pageIndex + 1) + ' / ' + pages.length : '';
    updateCalculationControls();
  }

  function buildPages () {
    stopPlayback();
    pageIndex = 0;
    const members = new Map();
    if (lastModel && lastModel.pageLabel) for (const row of lastModel.rows) members.set(row.page, row);
    const direction = document.getElementById('page-order').value === 'desc' ? -1 : 1;
    pages = [...members.keys()].sort((a, b) => {
      const x = members.get(a), y = members.get(b);
      const sx = pageSortValue(x), sy = pageSortValue(y);
      if (sx === null || sy === null) return sx === sy ? 0 : sx === null ? 1 : -1;
      const result = typeof sx === 'number' && typeof sy === 'number'
        ? sx - sy : String(sx).localeCompare(String(sy), 'ja', { numeric: true });
      return direction * result;
    });
    const select = document.getElementById('page-select');
    select.replaceChildren();
    pages.forEach((key, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = members.get(key).pageText;
      select.appendChild(option);
    });
    updatePageControls();
  }

  function pageSortValue (row) {
    const value = row.pageRaw;
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if (['date', 'datetime'].includes(row.pageType)) {
      const time = Date.parse(value);
      if (Number.isFinite(time)) return time;
    }
    return String(value);
  }

  function seekPage (index) {
    if (!pages.length || !lastModel) return;
    pageIndex = Math.max(0, Math.min(pages.length - 1, Number(index) || 0));
    updatePageControls();
    render(lastModel);
  }

  function schedulePage () {
    clearTimeout(playTimer);
    if (!playing) return;
    playTimer = setTimeout(() => {
      if (!playing || !lastModel) return;
      if (pageIndex === pages.length - 1) {
        if (!document.getElementById('page-loop').checked) { stopPlayback(); return; }
        seekPage(0);
      } else seekPage(pageIndex + 1);
      if (pageIndex === pages.length - 1 && !document.getElementById('page-loop').checked) stopPlayback();
      else schedulePage();
    }, Number(document.getElementById('page-speed').value) || 1000);
  }

  window.addEventListener('DOMContentLoaded', boot);

  function applyControlStates () {
    applyBackgroundAppearance();
    updateStemControls();
    updateCalculationControls();
    updateTrendControls();
    updateSnackControls();
    updateDepthControls();
    updateStackControls();
    updateReferenceControls();
    updatePlaneGuideControls();
    updateHistoryControls();
  }

  function boot () {
    restoreControls();
    restorePlaybackUiMode();
    appearanceIds.forEach(id=>document.getElementById(id).addEventListener('change',()=>{saveControl(id);applyControlStates();if(lastModel)render(lastModel);}));
    applyControlStates();
    document.getElementById('background-opacity').addEventListener('input', () => {
      saveBackground();
      applyBackgroundAppearance();
    });
    document.getElementById('layout-reset').addEventListener('click', () => {
      for (const [id, value] of Object.entries(layoutDefaults)) document.getElementById(id).value = value;
      saveLayout();
      if (lastModel) render(lastModel);
    });
    document.getElementById('history-opacity').addEventListener('input', () => {
      document.getElementById('history-opacity-value').textContent = setting('history-opacity') + '%';
      if (lastModel) render(lastModel);
    });
    document.getElementById('stem-opacity').addEventListener('input', () => {
      document.getElementById('stem-opacity-value').textContent = setting('stem-opacity') + '%';
      if (lastModel) render(lastModel);
    });
    for(const axis of ['x','z']) for(const [suffix,step] of [['up',-1],['down',1]]) {
      document.getElementById(axis+'-'+suffix).addEventListener('click',()=>{
        if(!lastModel)return;
        const values=axisMembers(lastModel,axis==='x'?'category':'depth',axis);
        const i=values.indexOf(setting(axis+'-member')), j=i+step;
        if(i<0 || j<0 || j>=values.length)return;
        [values[i],values[j]]=[values[j],values[i]];manualOrder[axis]=values;
        document.getElementById(axis+'-sort').value='manual';render(lastModel);
      });
    }
    for (const id of ['reference-source', 'reference-fixed', 'reference-op', 'reference-style', 'reference-color', 'reference-width', 'reference-lines', 'reference-line-color']) {
      document.getElementById(id).addEventListener('change', () => { updateReferenceControls(); if (lastModel) render(lastModel); });
    }
    document.getElementById('reference-lighten').addEventListener('input', () => {
      document.getElementById('reference-lighten-value').textContent = setting('reference-lighten') + '%';
      if (lastModel) render(lastModel);
    });
    document.getElementById('mark-width-mode').addEventListener('change', () => { updateWidthControls(); if (lastModel) render(lastModel); });
    document.getElementById('width-field').addEventListener('change', () => { updateWidthControls(); if (lastModel) render(lastModel); });
    for (const id of ['width-fixed', 'width-min', 'width-max']) {
      document.getElementById(id).addEventListener('input', () => {
        document.getElementById(id + '-value').textContent = setting(id) + '%';
        updateWidthControls();
        if (lastModel) render(lastModel);
      });
    }
    updateWidthControls();
    document.getElementById('mark-depth-mode').addEventListener('change', () => { updateDepthControls(); if (lastModel) render(lastModel); });
    document.getElementById('depth-field').addEventListener('change', () => { updateDepthControls(); if (lastModel) render(lastModel); });
    for (const id of ['depth-fixed', 'depth-min', 'depth-max']) {
      document.getElementById(id).addEventListener('input', () => {
        document.getElementById(id + '-value').textContent = setting(id) + '%';
        updateDepthControls();
        if (lastModel) render(lastModel);
      });
    }
    updateDepthControls();
    for (const id of ['snack-chocolate-ratio','snack-width','snack-coating-thickness','snack-crunch-intensity','snack-gloss']) {
      document.getElementById(id).addEventListener('input', () => {
        document.getElementById(id + '-value').textContent = setting(id) + '%';
        if (lastModel) render(lastModel);
      });
    }
    setupSettingsPanel();
    document.getElementById('header-mini-pages').addEventListener('click', () => document.getElementById('toggle-pages').click());
    document.getElementById('page-ui-toggle').addEventListener('click', () => {
      const panel = document.getElementById('pages');
      const nextMode = panel.dataset.playbackUi === 'advanced' ? 'simple' : 'advanced';
      applyPlaybackUiMode(nextMode);
      persistSetting(SETTINGS_PREFIX + 'page-ui-mode', nextMode);
      if (lastModel) render(lastModel);
    });
    document.getElementById('header-mini-settings').addEventListener('click', () => {
      const panel = document.getElementById('settings-panel');
      if (panel.hidden) document.getElementById('toggle-settings').click();
    });
    for (const [buttonId, panelId, openText, closedText] of [
      ['toggle-pages', 'pages', 'Hide playback', 'Show playback']
    ]) {
      const button = document.getElementById(buttonId);
      const panel = document.getElementById(panelId);
      const update = () => {
        button.textContent = panel.hidden ? closedText : openText;
        button.setAttribute('aria-expanded', String(!panel.hidden));
      };
      const applySavedState = () => {
        panel.hidden = storedSetting(SETTINGS_PREFIX + panelId + '-hidden') === 'true';
        update();
      };
      applyPagesPanelState = applySavedState;
      applySavedState();
      button.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        persistSetting(SETTINGS_PREFIX + panelId + '-hidden', String(panel.hidden));
        update();
        if (lastModel) render(lastModel);
      });
    }
    document.getElementById('page-order').addEventListener('change', () => {
      buildPages();
      if (lastModel) render(lastModel);
    });
    document.getElementById('color-field').addEventListener('change', event => {
      selectedColorField = event.target.value;
      applyColorField();
    });
    document.getElementById('page-prev').addEventListener('click', () => { stopPlayback(); seekPage(pageIndex - 1); });
    document.getElementById('page-next').addEventListener('click', () => { stopPlayback(); seekPage(pageIndex + 1); });
    for (const id of ['page-select', 'page-slider']) document.getElementById(id).addEventListener(id === 'page-slider' ? 'input' : 'change', event => { stopPlayback(); seekPage(event.target.value); });
    document.getElementById('page-speed').addEventListener('change', schedulePage);
    document.getElementById('page-play').addEventListener('click', () => {
      if (playing) { stopPlayback(); return; }
      if (pages.length < 2) return;
      if (pageIndex === pages.length - 1) seekPage(0);
      playing = true;
      document.getElementById('page-play').textContent = '❚❚ Pause';
      schedulePage();
    });
    window.addEventListener('pagehide', stopPlayback);
    updatePageControls();
    document.getElementById('transparency').addEventListener('input', () => {
      document.getElementById('transparency-value').textContent = document.getElementById('transparency').value + '%';
      if (lastModel) render(lastModel);
    });
    document.getElementById('clear-highlight').addEventListener('click', () => { highlighted = null; if (lastModel) render(lastModel); });
    document.getElementById('reset-filters').addEventListener('click', () => { filters = {}; if (lastModel) { buildFilters(); render(lastModel); } });
    document.getElementById('filter-panel').addEventListener('toggle', () => { if (lastModel) render(lastModel); });
    document.getElementById('guides').addEventListener('change', controlChanged);
    document.getElementById('pattern').addEventListener('change', controlChanged);
    document.getElementById('palette').addEventListener('change', controlChanged);
    document.getElementById('labels').addEventListener('change', controlChanged);
    document.getElementById('demo').addEventListener('click', () => showDemo('Sample view'));
    window.addEventListener('resize', () => {
      clearTimeout(redrawTimer);
      redrawTimer = setTimeout(() => { if (lastModel) render(lastModel); }, 80);
    });

    if (!window.tableau || !tableau.extensions) {
      showEmpty('Could not start 3D Chart Viz.', 'The Tableau Extensions API could not be loaded. Open this extension from Tableau Desktop, Tableau Cloud, Tableau Server, or the Sandbox development environment.');
      setStatus('Initialization error');
      return;
    }

    tableau.extensions.initializeAsync().then(() => {
      activateWorkbookSettings();
      restoreControls();
      restorePlaybackUiMode();
      applySettingsPanelState();
      applyPagesPanelState();
      applyControlStates();
      worksheet = tableau.extensions.worksheetContent.worksheet;
      worksheet.addEventListener(tableau.TableauEventType.SummaryDataChanged, refreshFromTableau);
      refreshFromTableau();
    }).catch(error => {
      showEmpty('Could not initialize 3D Chart Viz.', error && error.message ? error.message : 'Tableau rejected extension initialization.');
      setStatus('Initialization error');
    });
  }

  function setupSettingsPanel () {
    const workspace = document.getElementById('workspace');
    const panel = document.getElementById('settings-panel');
    const resizer = document.getElementById('settings-resizer');
    const toggle = document.getElementById('toggle-settings');
    const close = document.getElementById('settings-close');
    const dock = document.getElementById('settings-dock');
    const handle = document.getElementById('settings-drag-handle');
    let side = storedSetting(SETTINGS_PREFIX + 'settings-side') === 'left' ? 'left' : 'right';
    let panelWidth = Number(storedSetting(SETTINGS_PREFIX + 'settings-width')) || 320;

    const clampWidth = width => {
      const available = Math.max(240, workspace.clientWidth - 40);
      return Math.round(Math.max(240, Math.min(520, available, Number(width) || 320)));
    };
    const redraw = () => { if (lastModel) render(lastModel); };
    const update = () => {
      workspace.dataset.settingsSide = side;
      panelWidth = clampWidth(panelWidth);
      workspace.style.setProperty('--settings-width', panelWidth + 'px');
      toggle.textContent = panel.hidden ? '⚙ Settings' : '⚙ Close settings';
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
      dock.textContent = side === 'right' ? '⇤ Move left' : 'Move right ⇥';
      dock.setAttribute('aria-label', side === 'right' ? 'Move settings panel left' : 'Move settings panel right');
    };
    const setSide = nextSide => {
      side = nextSide === 'left' ? 'left' : 'right';
      persistSetting(SETTINGS_PREFIX + 'settings-side', side);
      update();
      redraw();
    };
    const setOpen = open => {
      panel.hidden = !open;
      persistSetting(SETTINGS_PREFIX + 'settings-panel-hidden', String(panel.hidden));
      update();
      redraw();
    };

    applySettingsPanelState = () => {
      side = storedSetting(SETTINGS_PREFIX + 'settings-side') === 'left' ? 'left' : 'right';
      panelWidth = Number(storedSetting(SETTINGS_PREFIX + 'settings-width')) || 320;
      panel.hidden = storedSetting(SETTINGS_PREFIX + 'settings-panel-hidden') === 'true';
      update();
    };
    applySettingsPanelState();
    toggle.addEventListener('click', () => setOpen(panel.hidden));
    close.addEventListener('click', () => setOpen(false));
    dock.addEventListener('click', () => setSide(side === 'right' ? 'left' : 'right'));

    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const startX = event.clientX;
      let dragging = false;
      handle.setPointerCapture(event.pointerId);
      const move = moveEvent => {
        if (Math.abs(moveEvent.clientX - startX) > 5) dragging = true;
        if (!dragging) return;
        document.body.classList.add('dragging-settings');
        workspace.classList.toggle('drop-left', moveEvent.clientX < workspace.getBoundingClientRect().left + workspace.clientWidth / 2);
        workspace.classList.toggle('drop-right', !workspace.classList.contains('drop-left'));
      };
      const finish = upEvent => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', finish);
        handle.removeEventListener('pointercancel', cancel);
        if (dragging) {
          const bounds = workspace.getBoundingClientRect();
          setSide(upEvent.clientX < bounds.left + bounds.width / 2 ? 'left' : 'right');
        }
        workspace.classList.remove('drop-left', 'drop-right');
        document.body.classList.remove('dragging-settings');
      };
      const cancel = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', finish);
        handle.removeEventListener('pointercancel', cancel);
        workspace.classList.remove('drop-left', 'drop-right');
        document.body.classList.remove('dragging-settings');
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', cancel);
    });

    resizer.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const startX = event.clientX;
      const startWidth = panel.getBoundingClientRect().width;
      document.body.classList.add('resizing-settings');
      resizer.setPointerCapture(event.pointerId);
      const move = moveEvent => {
        const delta = moveEvent.clientX - startX;
        panelWidth = clampWidth(startWidth + (side === 'left' ? delta : -delta));
        workspace.style.setProperty('--settings-width', panelWidth + 'px');
      };
      const finish = () => {
        resizer.removeEventListener('pointermove', move);
        resizer.removeEventListener('pointerup', finish);
        resizer.removeEventListener('pointercancel', finish);
        document.body.classList.remove('resizing-settings');
        persistSetting(SETTINGS_PREFIX + 'settings-width', String(panelWidth));
        redraw();
      };
      resizer.addEventListener('pointermove', move);
      resizer.addEventListener('pointerup', finish);
      resizer.addEventListener('pointercancel', finish);
    });
    resizer.addEventListener('dblclick', () => {
      panelWidth = 320;
      persistSetting(SETTINGS_PREFIX + 'settings-width', String(panelWidth));
      update();
      redraw();
    });
    resizer.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      panelWidth = clampWidth(panelWidth + direction * (side === 'left' ? 10 : -10));
      persistSetting(SETTINGS_PREFIX + 'settings-width', String(panelWidth));
      update();
      redraw();
    });
  }

  function restoreControls () {
    restoreControl('guides', 'hover');
    restoreControl('pattern', 'solid');
    restoreControl('palette', 'tableau');
    restoreControl('labels', 'true');
    for (const [id, fallback] of Object.entries(layoutDefaults)) restoreControl(id, fallback);
    for (const [id, fallback] of Object.entries(backgroundDefaults)) restoreControl(id, fallback);
    for (const id of appearanceIds) restoreControl(id, null);
  }

  function saveLayout () {
    for (const id of layoutIds) saveControl(id);
  }

  function saveBackground () {
    for (const id of backgroundIds) saveControl(id);
  }

  function controlChanged () {
    for (const id of ['guides', 'pattern', 'palette', 'labels']) saveControl(id);
    if (lastModel) render(lastModel);
  }

  async function refreshFromTableau () {
    const version = ++refreshVersion;
    stopPlayback();
    lastModel = null;
    buildPages();
    setStatus('Loading Tableau data…');
    hideMessage();
    try {
      const [summaryResult, encodingMap] = await Promise.all([
        getSummaryRows(worksheet), getEncodingMap(worksheet)
      ]);
      if (version !== refreshVersion) return;
      const namedRows = summaryResult.rows;
      const missing = [];
      if (!encodingMap.category) missing.push('Category (X)');
      if (!encodingMap.value) missing.push('Value (Y)');
      if (missing.length) {
        lastModel = null;
        showEmpty(`Add ${missing.join(' and ')} to the Marks card.`);
        setStatus('Waiting for fields');
        return;
      }

      const usedNames = new Set(['category', 'value', 'depth', 'page'].map(key => encodingMap[key]?.name));
      const extraNames = [...new Set(namedRows.flatMap(row => Object.keys(row)))].filter(name => !usedNames.has(name));
      buildColorFields(extraNames);
      const numericExtraNames = extraNames.filter(name => namedRows.some(row => ['int', 'float'].includes(row[name]?.dataType)));
      buildReferenceFields(numericExtraNames);
      buildWidthFields(numericExtraNames);
      buildDepthFields(numericExtraNames);
      const mappedRows = namedRows.map(row => ({
        extraNumbers: Object.fromEntries(extraNames.map(name => [name, row[name]?.value])),
        extraColors: Object.fromEntries(extraNames.map(name => [name, formatted(row, { name })])),
        category: formatted(row, encodingMap.category),
        categoryRaw: row[encodingMap.category.name]?.value,
        categoryType: row[encodingMap.category.name]?.dataType || '',
        value: numeric(row, encodingMap.value),
        valueText: formatted(row, encodingMap.value),
        rawValue: numeric(row, encodingMap.value),
        rawValueText: formatted(row, encodingMap.value),
        page: encodingMap.page ? JSON.stringify(row[encodingMap.page.name]?.value ?? null) : '',
        pageText: encodingMap.page ? formatted(row, encodingMap.page) : '',
        pageRaw: encodingMap.page ? row[encodingMap.page.name]?.value : null,
        pageType: encodingMap.page ? row[encodingMap.page.name]?.dataType : '',
        depth: encodingMap.depth ? formatted(row, encodingMap.depth) : 'All',
        color: selectedColorField ? formatted(row, { name: selectedColorField }) : (encodingMap.depth ? formatted(row, encodingMap.depth) : 'All')
      }));
      const invalidValueCount = mappedRows.filter(row => !Number.isFinite(row.value)).length;
      const rows = mappedRows.filter(row => Number.isFinite(row.value));
      const warnings = [];
      if (summaryResult.truncated) warnings.push(`For safety, only the first ${MAX_SOURCE_ROWS.toLocaleString()} input rows were loaded. Reduce the data using filters or aggregation.`);
      if (invalidValueCount) warnings.push(`Excluded ${invalidValueCount.toLocaleString()} Y values that could not be interpreted as numeric.`);

      lastModel = {
        rows,
        pageLabel: encodingMap.page ? encodingMap.page.name : '',
        categoryLabel: encodingMap.category.name,
        valueLabel: encodingMap.value.name,
        rawValueLabel: encodingMap.value.name,
        depthLabel: encodingMap.depth ? encodingMap.depth.name : '',
        colorLabel: selectedColorField || (encodingMap.depth ? encodingMap.depth.name : ''),
        extraFieldNames: extraNames,
        warnings,
        source: 'tableau'
      };
      filters = {};
      highlighted = null;
      buildPages();
      buildFilters();
      render(lastModel);
    } catch (error) {
      if (version !== refreshVersion) return;
      lastModel = null;
      buildPages();
      showEmpty('Could not load data.', error && error.message ? error.message : String(error));
      setStatus('Load error');
    }
  }

  async function getSummaryRows (sheet) {
    let result = [];
    let truncated = false;
    const reader = await sheet.getSummaryDataReaderAsync(undefined, { ignoreSelection: true });
    try {
      for (let pageNumber = 0; pageNumber < reader.pageCount; pageNumber++) {
        const page = await reader.getPageAsync(pageNumber);
        for (const values of page.data) {
          if (result.length >= MAX_SOURCE_ROWS) {
            truncated = true;
            break;
          }
          const row = {};
          for (const column of page.columns) {
            const cell = values[column.index];
            // SDK DataValue exposes prototype getters; object spread drops them.
            row[column.fieldName] = {
              value: cell?.value,
              formattedValue: cell?.formattedValue,
              dataType: column.dataType
            };
          }
          result.push(row);
        }
        if (truncated) break;
      }
    } finally {
      await reader.releaseAsync();
    }
    return { rows: result, truncated };
  }

  async function getEncodingMap (sheet) {
    const spec = await sheet.getVisualSpecificationAsync();
    const map = {};
    if (spec.activeMarksSpecificationIndex < 0) return map;
    const marks = spec.marksSpecifications[spec.activeMarksSpecificationIndex];
    for (const encoding of marks.encodings) map[encoding.id] = encoding.field;
    return map;
  }

  function formatted (row, field) {
    const cell = row[field.name];
    if (!cell) return '(Null)';
    return cell.formattedValue == null || cell.formattedValue === '' ? String(cell.value ?? '(Null)') : cell.formattedValue;
  }

  function numeric (row, field) {
    const cell = row[field.name];
    return cell ? Number(cell.value) : NaN;
  }

  function showDemo (status) {
    ++refreshVersion;
    buildColorFields(['Segment']);
    buildReferenceFields(['Target']);
    buildWidthFields(['Target']);
    buildDepthFields(['Target']);
    const rows = Array.from({ length: 12 }, (_, month) => sampleRows.map((row, i) => ({
      ...row, extraColors: { Segment: i % 2 ? 'Consumer' : 'Corporate' }, page: String(month), pageText: '2026-' + String(month + 1).padStart(2, '0'),
      pageRaw: month, pageType: 'int',
      extraNumbers: { Target: 85 + i * 5 },
      value: Math.round(row.value * (0.65 + month * 0.035 + 0.25 * Math.sin(month + i)))
    }))).flat();
    lastModel = { rows, pageLabel: 'Year-Month (sample)', categoryLabel: 'Category', valueLabel: 'SUM(Sales)', depthLabel: 'Region', colorLabel: 'Region', extraFieldNames: ['Segment', 'Target'], source: 'sample' };
    filters = {};
    highlighted = null;
    buildPages();
    buildFilters();
    applyColorField();
    setStatus(status);
  }

  function render (model) {
    hideMessage();
    hideTooltip();
    const chart = document.getElementById('chart');
    chart.replaceChildren();
    const width = Math.max(420, chart.clientWidth || 900);
    const height = Math.max(300, chart.clientHeight || 540);
    const allCategories = axisMembers(model, "category", "x");
    model = tableCalculation(model, allCategories);
    const colorKeys = unique(model.rows.map(d => d.color));
    const stackActive = setting('stack-mode') === 'color' && ['bar','cylinder'].includes(setting('shape'));
    const filteredAllRows = model.rows.filter(row => Object.entries(filters).every(([key, values]) => values.has(row[key])));
    const preparedRows = prepareStackRows(filteredAllRows, colorKeys, stackActive, setting('stack-order'));
    const axisRows = setting('filter-axis-mode') === 'compact' ? preparedRows : model.rows;
    const categories = axisMembers({ ...model, rows: axisRows }, "category", "x");
    const depths = axisMembers({ ...model, rows: axisRows }, "depth", "z");
    const pageRows = pages.length ? model.rows.filter(row => row.page === pages[pageIndex]) : model.rows;
    const matching = pages.length ? preparedRows.filter(row => row.page === pages[pageIndex]) : preparedRows;
    const rows = matching.slice(0, MAX_BARS);
    const notices = [...(model.warnings || [])];
    if (matching.length > MAX_BARS) notices.push(`Showing the first ${MAX_BARS} of ${matching.length} marks.`);
    const markWord = setting('shape') === 'sphere' ? ' spheres' : ' marks';
    setStatus(`${rows.length} / ${pageRows.length}${markWord} displayed${highlighted !== null ? ' · Highlight: ' + highlighted : ''}`);
    if (!rows.length) {
      showEmpty('No matching marks.', notices.join(' ') || 'Change the filters or reset to all selected.');
      return;
    }
    if (notices.length) showMessage(notices.join(' '));

    memberControl("x", categories);
    memberControl("z", depths);
    const referenceCandidates = stackActive ? rows.filter(row => row._stackLast) : rows;
    const targets = referenceCandidates.map(referenceValue);
    const domainValues = [0];
    for (const row of preparedRows) domainValues.push(row._stackBase || 0, (row._stackBase || 0) + row.value);
    for (const row of preparedRows) {
      const target = referenceValue(row);
      if (target !== null) domainValues.push(target);
    }
    let minValue = Math.min(...domainValues);
    let maxValue = Math.max(...domainValues);
    if (minValue === maxValue) maxValue = minValue + 1;
    const commonTarget = targets.length && targets.every(value => value !== null && value === targets[0]) ? targets[0] : null;
    const activeReference = document.getElementById('reference-source').value !== 'off';
    const referenceStyleLabels = { intensity: 'Bar intensity', outline: 'Outline', glow: 'Outline + glow', fill: 'Fill color', 'line-only': 'Reference line only' };
    document.getElementById('reference-note').textContent = activeReference
      ? 'Matched: ' + referenceCandidates.filter(referenceMatches).length + (stackActive ? ' stacks' : ' marks') + ' (' + referenceStyleLabels[setting('reference-style')] + ') / No reference: ' + targets.filter(value => value === null).length + (stackActive ? ' stacks' : ' marks') : '';
    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img' });
    svg.appendChild(makeDefs(colorKeys));

    const legendPosition = setting('legend-position');
    const showLegend = colorKeys.length > 1 && legendPosition !== 'hidden';
    const left = Math.max(54, Math.min(220, Number(setting('layout-left')) || Number(layoutDefaults['layout-left'])));
    const baseRight = Math.max(24, Math.min(220, Number(setting('layout-right')) || Number(layoutDefaults['layout-right'])));
    const right = baseRight + (showLegend && legendPosition === 'outside-right' ? 150 : 0);
    const top = Math.max(8, Math.min(120, Number(setting('layout-top')) || Number(layoutDefaults['layout-top'])));
    const bottom = Math.max(30, Math.min(200, Number(setting('layout-bottom')) || Number(layoutDefaults['layout-bottom'])));
    const zDx = Math.max(6, Math.min(55, (width - left - right) * 0.38 / (depths.length + 1), (height - bottom - 150) / ((depths.length + 1) * 0.55)));
    const zDy = zDx * 0.55;
    const zSpanX = (depths.length + 1) * zDx;
    const zSpanY = (depths.length + 1) * zDy;
    const originX = left + zSpanX;
    const baseY = height - bottom - zSpanY;
    const xSpace = Math.max(130, width - originX - right);
    const xStep = xSpace / Math.max(1, categories.length);
    const barWidth = Math.min(54, Math.max(10, xStep * (depths.length > 1 ? 0.42 : 0.58)));
    const widthLimit = Math.min(72, Math.max(10, xStep * (depths.length > 1 ? 0.58 : 0.78)));
    const widthMode = setting('mark-width-mode');
    const fieldWidthValues = widthMode === 'field' ? model.rows.map(widthFieldValue).filter(value => value !== null) : [];
    const fieldWidthMin = fieldWidthValues.length ? Math.min(...fieldWidthValues) : 0;
    const fieldWidthMax = fieldWidthValues.length ? Math.max(...fieldWidthValues) : 0;
    const minWidthPercent = Math.min(Number(setting('width-min')) || 30, Number(setting('width-max')) || 100);
    const maxWidthPercent = Math.max(Number(setting('width-min')) || 30, Number(setting('width-max')) || 100);
    const widthFor = row => {
      if (widthMode === 'fixed') return Math.max(6, widthLimit * (Number(setting('width-fixed')) || 75) / 100);
      if (widthMode !== 'field') return barWidth;
      const value = widthFieldValue(row);
      if (value === null || !fieldWidthValues.length) return barWidth;
      const ratio = fieldWidthMax === fieldWidthMin ? 0.5 : (value - fieldWidthMin) / (fieldWidthMax - fieldWidthMin);
      return Math.max(6, widthLimit * (minWidthPercent + ratio * (maxWidthPercent - minWidthPercent)) / 100);
    };
    const depthMode = setting('mark-depth-mode');
    const depthLimit = Math.max(4, Math.min(28, zDx * .72));
    const fieldDepthValues = depthMode === 'field' ? model.rows.map(depthFieldValue).filter(value => value !== null) : [];
    const fieldDepthMin = fieldDepthValues.length ? Math.min(...fieldDepthValues) : 0;
    const fieldDepthMax = fieldDepthValues.length ? Math.max(...fieldDepthValues) : 0;
    const minDepthPercent = Math.min(Number(setting('depth-min')) || 30, Number(setting('depth-max')) || 100);
    const maxDepthPercent = Math.max(Number(setting('depth-min')) || 30, Number(setting('depth-max')) || 100);
    const depthFor = (row, itemWidth) => {
      const automatic = Math.min(17, itemWidth * .24);
      if (setting('shape') === 'sphere' || depthMode === 'auto') return automatic;
      if (depthMode === 'fixed') return Math.max(2, depthLimit * (Number(setting('depth-fixed')) || 55) / 100);
      const value = depthFieldValue(row);
      if (value === null || !fieldDepthValues.length) return automatic;
      const ratio = fieldDepthMax === fieldDepthMin ? .5 : (value - fieldDepthMin) / (fieldDepthMax - fieldDepthMin);
      return Math.max(2, depthLimit * (minDepthPercent + ratio * (maxDepthPercent - minDepthPercent)) / 100);
    };
    const chartHeight = Math.max(110, baseY - top);
    const valueSpan = maxValue - minValue;
    const valueToY = (value, depthShift = 0) => baseY - (value - minValue) / valueSpan * chartHeight + depthShift;
    const zeroY = valueToY(0);

    const position = row => {
      const zi = depths.indexOf(row.depth), xi = categories.indexOf(row.category);
      const itemWidth = widthFor(row);
      const itemDepthX = depthFor(row, itemWidth);
      const itemDepthY = -itemDepthX * zDy / zDx;
      const x = originX + (xi + 0.5) * xStep - (zi + 1) * zDx - itemWidth / 2;
      const depthShift = (zi + 1) * zDy;
      const startY = valueToY(row._stackBase || 0, depthShift);
      const valueY = valueToY((row._stackBase || 0) + row.value, depthShift);
      const y = Math.max(startY, valueY);
      return {
        row, zi, xi, x, y, startY, valueY, zeroY: valueToY(0, depthShift),
        height: Math.abs(valueY - startY), negative: row.value < 0,
        width: itemWidth, dx: itemDepthX, dy: itemDepthY, cx: x + itemWidth / 2
      };
    };

    const historyMode = setting('history-mode');
    const historyCount = Math.max(1, Math.min(50, Number(setting('history-count')) || 3));
    const historyStart = historyMode === 'all' ? 0 : Math.max(0, pageIndex - historyCount);
    const historyIndexes = historyMode === 'none' || !pages.length
      ? [] : Array.from({ length: Math.max(0, pageIndex - historyStart) }, (_, index) => historyStart + index);
    const historyItems = historyIndexes.flatMap(historyPageIndex => preparedRows
      .filter(row => row.page === pages[historyPageIndex])
      .map(row => ({ ...position(row), pageIndex: historyPageIndex, age: pageIndex - historyPageIndex })))
      .slice(-MAX_HISTORY_MARKS);
    setStatus(`${rows.length} / ${pageRows.length}${markWord} displayed${historyItems.length ? ' · History ' + historyItems.length : ''}${highlighted !== null ? ' · Highlight: ' + highlighted : ''}`);

    const gridLayers = drawGrid(svg, { originX, baseY, zeroY, xSpace, xStep, chartHeight, zDx, zDy, zSpanX, zSpanY, depths, categories, minValue, maxValue, valueToY, barWidth, model });
    const guideLayer = svgEl('g', { class: 'projection-guides' });
    const referenceLayer = svgEl('g', { class: 'reference-layer', 'pointer-events': 'none' });
    const overlay = svgEl('g', { class: 'axis-overlay' });
    svg.appendChild(guideLayer);
    svg.appendChild(referenceLayer);

    const currentItems = rows.map(row => ({ ...position(row), pageIndex, age: 0 }));
    if (document.getElementById('trend-show').checked && !stackActive) {
      const partition = setting('trend-partition');
      const groups = new Map();
      const groupKey = item => partition === 'all' ? ['all']
        : partition === 'z' ? [item.row.depth]
          : partition === 'color' ? [item.row.color] : [item.row.depth, item.row.color];
      for (const item of currentItems) {
        const key = JSON.stringify(groupKey(item));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      }
      const trendLayer = svgEl('g', { class: 'trend-layer', 'pointer-events': 'none' });
      const dash = setting('trend-style') === 'dot' ? '1 5' : setting('trend-style') === 'dash' ? '7 5' : 'none';
      let lineCount = 0;
      for (const items of groups.values()) {
        const pointsForRegression = items.map(item => ({ ...trendX(item.row, categories), y: item.row.value, item }));
        const regression = linearRegression(pointsForRegression.map(point => ({ x: point.value, y: point.y })));
        if (!regression) continue;
        const orderedPoints = pointsForRegression.slice().sort((a, b) => a.value - b.value || a.item.xi - b.item.xi);
        const first = orderedPoints[0], last = orderedPoints[orderedPoints.length - 1];
        if (first.item.xi === last.item.xi) continue;
        const averageZi = items.reduce((sum, item) => sum + item.zi, 0) / items.length;
        const projected = point => {
          const predicted = regression.slope * point.value + regression.intercept;
          return {
            x: originX + (point.item.xi + 0.5) * xStep - (averageZi + 1) * zDx,
            y: valueToY(predicted, (averageZi + 1) * zDy),
            predicted
          };
        };
        const start = projected(first), end = projected(last);
        const colorIndex = Math.max(0, colorKeys.indexOf(items[0].row.color));
        const color = setting('trend-color-mode') === 'series' ? paletteColor(colorIndex) : setting('trend-color');
        trendLayer.appendChild(svgEl('line', {
          x1: start.x, y1: start.y, x2: end.x, y2: end.y, stroke: color,
          'stroke-width': Math.max(.5, Math.min(8, Number(setting('trend-width')) || 2.5)),
          'stroke-dasharray': dash, 'stroke-linecap': 'round', class: 'trend-line'
        }));
        if (document.getElementById('trend-stats').checked) {
          const unit = first.unit || 'item';
          const direction = Math.abs(regression.slope) < 1e-12 ? 'Flat' : regression.slope > 0 ? 'Up' : 'Down';
          const label = `${direction}  Slope ${compactNumber(regression.slope)}/${unit}  R² ${regression.r2.toFixed(2)}`;
          trendLayer.appendChild(textEl(end.x + 6, end.y - 7, label, 'trend-label', 'start'));
        }
        lineCount++;
      }
      document.getElementById('trend-summary').textContent = lineCount ? `Trend lines: ${lineCount}` : 'No series available for a trend line';
      svg.appendChild(trendLayer);
    } else document.getElementById('trend-summary').textContent = '';
    if (setting('shape') === 'sphere' && document.getElementById('stem-show').checked) {
      const stemLayer = svgEl('g', { class: 'stem-layer', 'pointer-events': 'none' });
      const stemDash = setting('stem-style') === 'dot' ? '1 5' : setting('stem-style') === 'dash' ? '7 5' : 'none';
      const stemBaseOpacity = Number(setting('stem-opacity')) / 100;
      const stemItems = document.getElementById('stem-history').checked ? [...historyItems, ...currentItems] : currentItems;
      for (const item of stemItems) {
        const colorIndex = Math.max(0, colorKeys.indexOf(item.row.color));
        const historyFade = item.age
          ? Number(setting('history-opacity')) / 100 * (document.getElementById('history-fade').checked ? 1 / item.age : 1)
          : 1;
        const highlightFade = highlighted !== null && highlighted !== item.row.color ? .18 : 1;
        stemLayer.appendChild(svgEl('line', {
          x1: item.cx, y1: item.zeroY, x2: item.cx, y2: item.valueY,
          stroke: setting('stem-color-mode') === 'mark' ? paletteColor(colorIndex) : setting('stem-color'),
          'stroke-width': Math.max(.5, Math.min(6, Number(setting('stem-width')) || 2)),
          'stroke-dasharray': stemDash, 'stroke-linecap': 'round',
          opacity: stemBaseOpacity * historyFade * highlightFade,
          class: item.age ? 'stem-line history-stem' : 'stem-line current-stem'
        }));
      }
      svg.appendChild(stemLayer);
    }
    if (document.getElementById('trajectory-show').checked && pages.length && historyItems.length) {
      // X may change from page to page (for example, Month 1 -> Month 2).
      // Build series by Z + color, then pair multiple marks in the same page by
      // their stable X order. A single mark per page therefore becomes one
      // continuous path that is free to move horizontally.
      const seriesPages = new Map();
      for (const item of [...historyItems, ...currentItems]) {
        const seriesKey = JSON.stringify([item.row.depth, item.row.color]);
        if (!seriesPages.has(seriesKey)) seriesPages.set(seriesKey, new Map());
        const pageMap = seriesPages.get(seriesKey);
        if (!pageMap.has(item.pageIndex)) pageMap.set(item.pageIndex, []);
        pageMap.get(item.pageIndex).push(item);
      }
      const tracks = [];
      for (const pageMap of seriesPages.values()) {
        const orderedPages = [...pageMap.entries()].sort((a, b) => a[0] - b[0]);
        for (const [, items] of orderedPages) items.sort((a, b) => a.xi - b.xi || a.row.category.localeCompare(b.row.category, 'ja', { numeric: true }));
        const slots = Math.max(...orderedPages.map(([, items]) => items.length));
        for (let slot = 0; slot < slots; slot++) tracks.push(orderedPages.map(([, items]) => items[slot]).filter(Boolean));
      }
      const lineLayer = svgEl('g', { class: 'trajectory-layer', 'pointer-events': 'none' });
      const dash = setting('trajectory-style') === 'dot' ? '1 5' : setting('trajectory-style') === 'dash' ? '7 5' : 'none';
      for (const track of tracks) {
        const segments = trajectorySegments(track, categories.length, document.getElementById('trajectory-break-wrap').checked);
        for (const segment of segments) {
          if (segment.length < 2) continue;
          lineLayer.appendChild(svgEl('polyline', {
            points: points(segment.map(item => [item.cx, item.valueY])), fill: 'none',
            stroke: setting('trajectory-color'), 'stroke-width': Math.max(.5, Math.min(6, Number(setting('trajectory-width')) || 2)),
            'stroke-dasharray': dash, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'trajectory-line'
          }));
        }
      }
      svg.appendChild(lineLayer);
    }

    const orderedHistory = historyItems.sort((a, b) => a.zi - b.zi || a.xi - b.xi || a.pageIndex - b.pageIndex);
    const drawHistoryItem = item => {
      const colorIndex = Math.max(0, colorKeys.indexOf(item.row.color));
      const fade = document.getElementById('history-fade').checked ? 1 / Math.max(1, item.age) : 1;
      drawBar(svg, { x: item.x, y: item.y, startY: item.startY, valueY: item.valueY, negative: item.negative, width: item.width, height: item.height, dx: item.dx, dy: item.dy,
        row: item.row, colorIndex, showValue: false, historyAge: item.age, model,
        opacity: (1 - Number(setting('transparency')) / 100) * Number(setting('history-opacity')) / 100 * fade });
    };
    orderedHistory.filter(item => item.negative).forEach(drawHistoryItem);

    const ordered = currentItems
      .sort((a, b) => a.zi - b.zi || a.xi - b.xi);
    const guideKey = item => stackActive
      ? JSON.stringify([item.row.page, item.row.category, item.row.depth, item.row.value < 0 ? 'negative' : 'positive'])
      : item;
    const guides = new Map();
    for (const item of ordered) {
      if (stackActive && !item.row._stackLast) continue;
      const colorIndex = Math.max(0, colorKeys.indexOf(item.row.color));
      const guideValue = stackActive ? item.row._stackTotal : item.row.value;
      const guide = svgEl('g', { class: 'projection-guide', 'data-guide-value': guideValue, 'data-stack-total': String(stackActive) });
      const wallX = originX - (item.zi + 1) * zDx;
      guide.appendChild(svgEl('line', { x1: wallX, y1: item.valueY, x2: item.cx, y2: item.valueY, class: 'projection-line', stroke: paletteColor(colorIndex) }));
      guide.appendChild(svgEl('circle', { cx: wallX, cy: item.valueY, r: 3, fill: paletteColor(colorIndex) }));
      const axisY = valueToY(guideValue);
      guide.appendChild(svgEl('line', { x1: wallX, y1: item.valueY, x2: originX, y2: axisY, class: 'projection-line axis-connection', stroke: paletteColor(colorIndex) }));
      const axisMarker = svgEl('g');
      axisMarker.appendChild(svgEl('circle', { cx: originX, cy: axisY, r: 3.5, fill: paletteColor(colorIndex), class: 'axis-guide-dot' }));
      axisMarker.appendChild(textEl(originX - 10, axisY - 7, compactNumber(guideValue), 'value-label axis-guide-value', 'end'));
      guide.style.visibility = document.getElementById('guides').value === 'all' ? 'visible' : 'hidden';
      axisMarker.style.visibility = guide.style.visibility;
      guide.axisMarker = axisMarker;
      guides.set(guideKey(item), guide);
      overlay.appendChild(axisMarker);
      guideLayer.appendChild(guide);
    }
    const drawCurrentItem = item => {
      const h = item.height;
      const x = item.x;
      const y = item.y;
      const colorIndex = Math.max(0, colorKeys.indexOf(item.row.color));
      const guide = guides.get(guideKey(item));
      const target = referenceValue(item.row);
      const stackLabelMode = setting('stack-label');
      const showSegmentLabel = document.getElementById('labels').checked && (!stackActive || ['segment','both'].includes(stackLabelMode));
      const showTotalLabel = document.getElementById('labels').checked && stackActive && item.row._stackLast && ['total','both'].includes(stackLabelMode);
      drawBar(svg, { x, y, startY: item.startY, valueY: item.valueY, negative: item.negative, width: item.width, height: h, dx: item.dx, dy: item.dy, row: item.row, colorIndex,
        referenceMatch: referenceMatches(item.row), referenceHasValue: target !== null, guide, model,
        showValue: showSegmentLabel, stackTotalLabel: showTotalLabel ? compactNumber(item.row._stackTotal) : '' });
      if (target !== null && commonTarget === null && document.getElementById('reference-lines').checked && (!stackActive || item.row._stackLast)) {
        const referenceY = valueToY(target, (item.zi + 1) * zDy);
        const line = svgEl('line', { x1: x - 4, x2: x + item.width + 4, y1: referenceY, y2: referenceY, stroke: document.getElementById('reference-line-color').value, 'stroke-width': 2, 'stroke-dasharray': '5 3', class: 'reference-mark' });
        const title = svgEl('title'); title.textContent = 'Reference value: ' + target; line.appendChild(title); referenceLayer.appendChild(line);
      }
    };
    ordered.filter(item => item.negative).forEach(drawCurrentItem);
    svg.appendChild(gridLayers.zeroPlane);
    orderedHistory.filter(item => !item.negative).forEach(drawHistoryItem);
    ordered.filter(item => !item.negative).forEach(drawCurrentItem);
    if (commonTarget !== null && document.getElementById('reference-lines').checked) {
      const y = valueToY(commonTarget);
      referenceLayer.appendChild(svgEl('line', { x1: originX, x2: originX + xSpace, y1: y, y2: y, stroke: document.getElementById('reference-line-color').value, 'stroke-width': 2, 'stroke-dasharray': '5 3', class: 'reference-common' }));
      overlay.appendChild(textEl(originX + xSpace, y - 7, 'Reference: ' + compactNumber(commonTarget), 'value-label', 'end'));
    }

    overlay.appendChild(gridLayers.axisOverlay);
    svg.appendChild(overlay);
    if (showLegend) {
      const offsetX = Math.max(-200, Math.min(200, Number(setting('legend-x')) || 0));
      const offsetY = Math.max(-200, Math.min(200, Number(setting('legend-y')) || 0));
      const legendX = legendPosition === 'outside-right' ? width - right + 18
        : legendPosition === 'inside-left' ? originX + 18 : originX + xSpace - 128;
      drawLegend(svg, colorKeys, model.colorLabel || 'Color', legendX + offsetX, top + 18 + offsetY);
    }

    decorateChart(svg);
    chart.appendChild(svg);
  }

  function drawGrid (svg, c) {
    const g = svgEl('g');
    const zeroPlane = svgEl('g', { class: 'zero-plane-layer', 'pointer-events': 'none' });
    const axisOverlay = svgEl('g', { class: 'y-axis-overlay', 'pointer-events': 'none' });
    g.appendChild(svgEl('rect', { x: c.originX, y: c.baseY-c.chartHeight, width:c.xSpace, height:c.chartHeight, class:'back-wall' }));
    const floorPoints = [
      [c.originX, c.zeroY],
      [c.originX + c.xSpace, c.zeroY],
      [c.originX + c.xSpace - c.zSpanX, c.zeroY + c.zSpanY],
      [c.originX - c.zSpanX, c.zeroY + c.zSpanY]
    ];
    zeroPlane.appendChild(svgEl('polygon', { points: points(floorPoints), class: 'floor' }));
    g.appendChild(svgEl('polygon', { points: points([
      [c.originX, c.baseY], [c.originX - c.zSpanX, c.baseY + c.zSpanY],
      [c.originX - c.zSpanX, c.baseY + c.zSpanY - c.chartHeight],
      [c.originX, c.baseY - c.chartHeight]
    ]), class: 'side-wall' }));

    if (c.minValue < 0 && setting('negative-floor-mode') !== 'none') {
      const lowerFloorPoints = [
        [c.originX, c.baseY],
        [c.originX + c.xSpace, c.baseY],
        [c.originX + c.xSpace - c.zSpanX, c.baseY + c.zSpanY],
        [c.originX - c.zSpanX, c.baseY + c.zSpanY]
      ];
      g.appendChild(svgEl('polygon', { points: points(lowerFloorPoints), class: 'lower-floor' }));
      for (let zi = 0; zi < c.depths.length; zi++) {
        const xShift = (zi + 1) * c.zDx;
        const yShift = (zi + 1) * c.zDy;
        g.appendChild(svgEl('line', {
          x1: c.originX - xShift, y1: c.baseY + yShift,
          x2: c.originX + c.xSpace - xShift, y2: c.baseY + yShift,
          class: 'floor-grid lower-floor-grid region-guide'
        }));
      }
      for (let xi = 0; xi <= c.categories.length; xi++) {
        const x = c.originX + xi * c.xStep;
        g.appendChild(svgEl('line', {
          x1: x, y1: c.baseY,
          x2: x - c.zSpanX, y2: c.baseY + c.zSpanY,
          class: 'floor-grid lower-floor-grid'
        }));
      }
    }

    const tickValues = [];
    for (let i = 0; i <= 4; i++) {
      const value = c.minValue + (c.maxValue - c.minValue) * i / 4;
      tickValues.push(value);
      const y = c.valueToY(value);
      g.appendChild(svgEl('line', { x1: c.originX, y1: y, x2: c.originX - c.zSpanX, y2: y + c.zSpanY, class: 'wall-grid' }));
      g.appendChild(svgEl('line', { x1: c.originX, y1: y, x2: c.originX + c.xSpace, y2: y, class: 'grid' }));
      axisText(axisOverlay,c.originX - 8, y + 4, compactNumber(value), 'axis-label', 'end','y','tick');
    }
    if (c.minValue < 0 && c.maxValue > 0 && !tickValues.some(value => Math.abs(value) < (c.maxValue - c.minValue) * 1e-9)) {
      axisText(axisOverlay, c.originX - 8, c.zeroY + 4, '0', 'axis-label zero-label', 'end', 'y', 'tick');
    }
    for (let zi = 0; zi < c.depths.length; zi++) {
      const xShift = (zi + 1) * c.zDx;
      const yShift = (zi + 1) * c.zDy;
      zeroPlane.appendChild(svgEl('line', { x1: c.originX - xShift, y1: c.zeroY + yShift, x2: c.originX + c.xSpace - xShift, y2: c.zeroY + yShift, class: 'floor-grid region-guide' }));
      g.appendChild(svgEl('line', { x1: c.originX - xShift, y1: c.baseY + yShift, x2: c.originX - xShift, y2: c.baseY + yShift - c.chartHeight, class: 'wall-grid' }));
    }
    for (let xi = 0; xi <= c.categories.length; xi++) {
      const x = c.originX + xi * c.xStep;
      zeroPlane.appendChild(svgEl('line', { x1: x, y1: c.zeroY, x2: x - c.zSpanX, y2: c.zeroY + c.zSpanY, class: 'floor-grid' }));
    }

    zeroPlane.appendChild(svgEl('line', { x1: c.originX, y1: c.zeroY, x2: c.originX + c.xSpace, y2: c.zeroY, class: 'axis zero-axis' }));
    // Keep the axis line behind marks. Only its labels are repeated in the
    // foreground so a near-side mark cannot turn the axis into a line through
    // the middle of the bar.
    g.appendChild(svgEl('line', { x1: c.originX, y1: c.baseY, x2: c.originX, y2: c.baseY - c.chartHeight - 12, class: 'axis' }));
    if (c.depths.length > 1) zeroPlane.appendChild(svgEl('line', { x1: c.originX, y1: c.zeroY, x2: c.originX - c.zSpanX - 24, y2: c.zeroY + c.zSpanY + 14, class: 'axis' }));

    c.categories.forEach((name, i) => {
      const x = c.originX + (i + 0.5) * c.xStep - c.zSpanX;
      const y = c.baseY + c.zSpanY + 25;
      axisText(zeroPlane,x,y,truncate(name,20),'axis-label category-label','middle','x','tick');
    });
    if (c.model.depthLabel) c.depths.forEach((name, i) => {
      const x = c.originX + c.xSpace - (i + 1) * c.zDx + 12;
      const y = c.zeroY + (i + 1) * c.zDy + 4;
      zeroPlane.appendChild(svgEl('line', { x1: x - 12, y1: y - 4, x2: x - 4, y2: y - 4, class: 'floor-grid' }));
      const label = textEl(x, y, truncate(name, 22), 'axis-label depth-label', 'start');
      label.setAttribute('data-axis','z');label.setAttribute('data-part','tick');
      const fullName = svgEl('title');
      fullName.textContent = name;
      label.appendChild(fullName);
      zeroPlane.appendChild(label);
    });
    const fraction=axis=>setting(axis+'-title-pos')==='start'?0:setting(axis+'-title-pos')==='center'?0.5:1;
    axisText(zeroPlane,c.originX-c.zSpanX+c.xSpace*fraction('x'),c.baseY+c.zSpanY+55,c.model.categoryLabel,'axis-title','middle','x','title');
    axisText(axisOverlay,c.originX-13,c.baseY-c.chartHeight*fraction('y')-18,c.model.valueLabel,'axis-label','start','y','title');
    if(c.model.depthLabel)axisText(zeroPlane,c.originX+c.xSpace-c.zSpanX*fraction('z')+25,c.zeroY+c.zSpanY*fraction('z')+28,c.model.depthLabel,'axis-title','start','z','title');
    svg.appendChild(g);
    return { zeroPlane, axisOverlay };
  }

  function drawBar (svg, b) {
    const isHistory = Boolean(b.historyAge);
    const referenceStyle = setting('reference-style');
    const referenceMatch = Boolean(b.referenceMatch) && !isHistory;
    const fillColorIndex = referenceMatch && referenceStyle === 'fill' ? -1 : b.colorIndex;
    const useLightColor = !isHistory && referenceStyle === 'intensity' && Boolean(b.referenceHasValue) && !referenceMatch;
    const group = svgEl('g', isHistory ? { class: 'history-mark', 'aria-hidden': 'true' } : { tabindex: '0' });
    if (!isHistory) {
      group.setAttribute('role', 'button');
      group.setAttribute('aria-label', 'Highlight ' + b.row.category + ' ' + b.row.color);
    }
    const select = () => { highlighted = highlighted === b.row.color ? null : b.row.color; render(lastModel); };
    if (!isHistory) {
      group.addEventListener('click', select);
      group.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
    }
    if (highlighted !== null && highlighted !== b.row.color) group.style.opacity = '0.18';
    const toggleGuide = visible => {
      if (document.getElementById('guides').value === 'hover') {
        b.guide.style.visibility = visible ? 'visible' : 'hidden';
        b.guide.axisMarker.style.visibility = b.guide.style.visibility;
      }
    };
    if (!isHistory) {
      group.addEventListener('pointerenter', () => toggleGuide(true));
      group.addEventListener('pointerleave', () => toggleGuide(false));
      group.addEventListener('focus', () => toggleGuide(true));
      group.addEventListener('blur', () => toggleGuide(false));
    }
    const topY = b.y - b.height;
    const bottomY = b.y;
    const startY = Number.isFinite(b.startY) ? b.startY : bottomY;
    const valueY = Number.isFinite(b.valueY) ? b.valueY : topY;
    const negative = Boolean(b.negative);
    const patternId = `p-${document.getElementById('pattern').value}-${useLightColor ? 'light-' : ''}${fillColorIndex}`;
    const surfaceColor = useLightColor ? mixWithWhite(paletteColor(fillColorIndex), Number(setting('reference-lighten')) || 55) : paletteColor(fillColorIndex);
    const front = svgEl('polygon', { points: points([[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, topY], [b.x, topY]]), fill: `url(#${patternId})`, class: 'bar-face' });
    const side = svgEl('polygon', { points: points([[b.x + b.width, b.y], [b.x + b.width + b.dx, b.y + b.dy], [b.x + b.width + b.dx, topY + b.dy], [b.x + b.width, topY]]), fill: shade(surfaceColor, -24), class: 'bar-face' });
    const top = svgEl('polygon', { points: points([[b.x, valueY], [b.x + b.width, valueY], [b.x + b.width + b.dx, valueY + b.dy], [b.x + b.dx, valueY + b.dy]]), fill: shade(surfaceColor, 28), class: 'bar-face' });
    const negativeZeroCap = svgEl('polygon', {
      points: points([[b.x, startY], [b.x + b.width, startY], [b.x + b.width + b.dx, startY + b.dy], [b.x + b.dx, startY + b.dy]]),
      fill: shade(surfaceColor, 28), 'fill-opacity': .55, class: 'bar-face', 'data-negative-zero-cap': 'true'
    });
    const surfaces = svgEl('g', {
      class: 'bar-surfaces',
      opacity: b.opacity == null ? 1 - Number(document.getElementById('transparency').value) / 100 : b.opacity,
      'data-mark-width': b.width, 'data-mark-depth': b.dx,
      'data-value': b.row.value, 'data-start-y': startY, 'data-value-y': valueY,
      'data-negative': String(negative)
    });
    let faces=negative ? [front,side,negativeZeroCap] : [front,side,top];
    const shape=setting('shape');
    if(shape==='snack') {
      const snackStyle = setting('snack-style') || 'classic';
      const ratio = Math.max(.7, Math.min(.95, Number(setting('snack-chocolate-ratio')) / 100 || .85));
      const widthScale = Math.max(.35, Math.min(.9, Number(setting('snack-width')) / 100 || .65));
      const requestedCoatingScale = Math.max(1, Math.min(1.5, Number(setting('snack-coating-thickness')) / 100 || 1.25));
      const coatingScale = snackStyle === 'classic' ? 1 : requestedCoatingScale;
      const crunchOpacity = snackStyle === 'crunch'
        ? Math.max(0, Math.min(1, Number(setting('snack-crunch-intensity')) / 100 || 0)) : 0;
      const gloss = Math.max(0, Math.min(1, Number(setting('snack-gloss')) / 100));
      const cx = b.x + b.width / 2;
      const snackWidth = Math.max(4, b.width * widthScale);
      const snackX = cx - snackWidth / 2;
      const snackDx = Math.max(1.5, b.dx * widthScale);
      const snackDy = b.dx ? b.dy * snackDx / b.dx : 0;
      const coatingWidth = Math.min(Math.max(4, snackWidth * coatingScale), Math.max(4, b.width * .98));
      const coatingX = cx - coatingWidth / 2;
      const coatingDx = Math.min(Math.max(1.5, snackDx * coatingScale), Math.max(1.5, b.dx * .98));
      const coatingDy = b.dx ? b.dy * coatingDx / b.dx : 0;
      const boundaryY = startY + (valueY - startY) * (1 - ratio);
      const fixedChocolate = referenceMatch && referenceStyle === 'fill' ? paletteColor(-1) : setting('snack-chocolate-color');
      const chocolateBase = setting('snack-chocolate-mode') === 'series' ? surfaceColor : fixedChocolate;
      const biscuitBase = setting('snack-biscuit-color');
      const chocolate = useLightColor && setting('snack-chocolate-mode') !== 'series'
        ? mixWithWhite(chocolateBase, Number(setting('reference-lighten')) || 55) : chocolateBase;
      const biscuit = useLightColor ? mixWithWhite(biscuitBase, Number(setting('reference-lighten')) || 55) : biscuitBase;
      if (setting('snack-profile') === 'round') {
        const rx = snackWidth / 2, ry = Math.max(1.5, Math.min(14, Math.abs(snackDy)));
        const coatingRx = coatingWidth / 2, coatingRy = Math.max(1.5, Math.min(16, Math.abs(coatingDy)));
        // Normalize the vertical direction before drawing the cylindrical
        // side. Without this, positive biscuit segments are traced bottom to
        // top and their front face folds inward or disappears on short marks.
        const segmentPath = (fromY, toY, radiusX = rx, radiusY = ry) => {
          const upperY = Math.min(fromY, toY);
          const lowerY = Math.max(fromY, toY);
          return `M${cx-radiusX},${upperY} A${radiusX},${radiusY} 0 0 1 ${cx+radiusX},${upperY} L${cx+radiusX},${lowerY} A${radiusX},${radiusY} 0 0 1 ${cx-radiusX},${lowerY} Z`;
        };
        const biscuitFace = svgEl('path', { d: segmentPath(startY, boundaryY), fill: biscuit, class: 'bar-face snack-biscuit', 'data-zero-edge': negative ? 'capped' : 'rounded', 'data-snack-segment': 'biscuit' });
        const chocolateFace = svgEl('path', { d: segmentPath(boundaryY, valueY, coatingRx, coatingRy), fill: chocolate, class: 'bar-face snack-chocolate' });
        const chocolateCap = svgEl('ellipse', { cx, cy: valueY, rx: coatingRx, ry: coatingRy, fill: shade(chocolate, negative ? -10 : 22), class: 'bar-face snack-chocolate snack-cap' });
        const zeroCap = svgEl('ellipse', { cx, cy: startY, rx, ry, fill: shade(biscuit, 22), 'fill-opacity': negative ? .55 : 1, class: 'bar-face snack-biscuit snack-zero-cap', 'data-zero-cap': 'true', 'data-negative-zero-cap': String(negative) });
        const chocolateGloss = svgEl('path', { d: segmentPath(boundaryY, valueY, coatingRx, coatingRy), fill: 'url(#round-shade)', opacity: .22 + gloss * .62, 'pointer-events': 'none', class: 'snack-gloss chocolate-gloss' });
        const crunchFace = crunchOpacity > 0 ? svgEl('path', {
          d: segmentPath(boundaryY, valueY, coatingRx, coatingRy), fill: 'url(#snack-crunch)', opacity: crunchOpacity,
          'pointer-events': 'none', class: 'snack-crunch'
        }) : null;
        const biscuitGloss = svgEl('path', { d: segmentPath(startY, boundaryY), fill: 'url(#round-shade)', opacity: .12 + gloss * .28, 'pointer-events': 'none', class: 'snack-gloss biscuit-gloss' });
        // The material seam must be opaque. A translucent ellipse lets the
        // wall/floor grid show through and looks like a gap between the
        // biscuit and chocolate sections.
        const seam = svgEl('ellipse', { cx, cy: boundaryY, rx: coatingRx, ry: coatingRy, fill: shade(chocolate, -12), opacity: 1, 'pointer-events': 'none', class: 'snack-seam' });
        faces = negative ? [biscuitFace, chocolateFace, zeroCap] : [biscuitFace, chocolateFace, chocolateCap];
        if (negative && coatingScale > 1) {
          // At a negative value the thin biscuit enters the coating from
          // above. Draw the wider chocolate collar first, then the biscuit's
          // front half over it. Otherwise the full ellipse masks the biscuit
          // and appears as a detached floating ring.
          surfaces.append(chocolateFace, chocolateGloss);
          if (crunchFace) surfaces.appendChild(crunchFace);
          surfaces.append(seam, biscuitFace, biscuitGloss, zeroCap);
          surfaces.setAttribute('data-snack-seam-order','negative-collar-behind-biscuit');
        } else {
          surfaces.append(biscuitFace, chocolateFace, chocolateGloss);
          if (crunchFace) surfaces.appendChild(crunchFace);
          surfaces.append(biscuitGloss, seam);
          if (negative) surfaces.appendChild(zeroCap);
          if (!negative) surfaces.appendChild(chocolateCap);
          surfaces.setAttribute('data-snack-seam-order','standard');
        }
      } else {
        const biscuitFront = svgEl('polygon', { points: points([[snackX,startY],[snackX+snackWidth,startY],[snackX+snackWidth,boundaryY],[snackX,boundaryY]]), fill: biscuit, class: 'bar-face snack-biscuit' });
        const biscuitSide = svgEl('polygon', { points: points([[snackX+snackWidth,startY],[snackX+snackWidth+snackDx,startY+snackDy],[snackX+snackWidth+snackDx,boundaryY+snackDy],[snackX+snackWidth,boundaryY]]), fill: shade(biscuit,-20), class: 'bar-face snack-biscuit' });
        const chocolateFront = svgEl('polygon', { points: points([[coatingX,boundaryY],[coatingX+coatingWidth,boundaryY],[coatingX+coatingWidth,valueY],[coatingX,valueY]]), fill: chocolate, class: 'bar-face snack-chocolate' });
        const chocolateSide = svgEl('polygon', { points: points([[coatingX+coatingWidth,boundaryY],[coatingX+coatingWidth+coatingDx,boundaryY+coatingDy],[coatingX+coatingWidth+coatingDx,valueY+coatingDy],[coatingX+coatingWidth,valueY]]), fill: shade(chocolate,-24), class: 'bar-face snack-chocolate' });
        const chocolateTop = svgEl('polygon', { points: points([[coatingX,valueY],[coatingX+coatingWidth,valueY],[coatingX+coatingWidth+coatingDx,valueY+coatingDy],[coatingX+coatingDx,valueY+coatingDy]]), fill: shade(chocolate,negative ? -10 : 25), class: 'bar-face snack-chocolate snack-cap' });
        const biscuitZeroTop = svgEl('polygon', { points: points([[snackX,startY],[snackX+snackWidth,startY],[snackX+snackWidth+snackDx,startY+snackDy],[snackX+snackDx,startY+snackDy]]), fill: shade(biscuit,22), 'fill-opacity': negative ? .55 : 1, class: 'bar-face snack-biscuit snack-zero-cap', 'data-zero-cap': 'true', 'data-negative-zero-cap': String(negative) });
        faces = negative
          ? [biscuitFront,biscuitSide,chocolateFront,chocolateSide,biscuitZeroTop]
          : [biscuitFront,biscuitSide,chocolateFront,chocolateSide,chocolateTop];
        surfaces.append(...faces);
        surfaces.appendChild(svgEl('polygon', { points: chocolateFront.getAttribute('points'), fill: 'url(#round-shade)', opacity: .12 + gloss * .38, 'pointer-events': 'none', class: 'snack-gloss' }));
        if (crunchOpacity > 0) surfaces.appendChild(svgEl('polygon', {
          points: chocolateFront.getAttribute('points'), fill: 'url(#snack-crunch)', opacity: crunchOpacity,
          'pointer-events': 'none', class: 'snack-crunch'
        }));
      }
      surfaces.setAttribute('data-shape','snack');
      surfaces.setAttribute('data-snack-style',snackStyle);
      surfaces.setAttribute('data-snack-profile',setting('snack-profile'));
      surfaces.setAttribute('data-rendered-width',snackWidth);
      surfaces.setAttribute('data-coating-width',coatingWidth);
      surfaces.setAttribute('data-snack-boundary-y',boundaryY);
      surfaces.setAttribute('data-crunch-intensity',crunchOpacity);
    } else if(shape==='sphere') {
      const cx=b.x+b.width/2, cy=valueY, radius=Math.max(5,Math.min(34,b.width/2));
      faces=[svgEl('circle',{cx,cy,r:radius,fill:`url(#${patternId})`,class:'bar-face sphere-face'})];
      const shadeFace=svgEl('circle',{cx,cy,r:radius,fill:'url(#sphere-shade)','pointer-events':'none',class:'sphere-shade'});
      surfaces.append(faces[0],shadeFace);
      surfaces.setAttribute('data-shape','sphere');
    } else if(shape==='cylinder' || shape==='cone') {
      const cx=b.x+b.width/2, rx=b.width/2, ry=Math.max(1.5,Math.min(14,Math.abs(b.dy)));
      // The centre of the top ellipse/apex uses exactly the same Y as its guide.
      const d=shape==='cone'
        ? `M${cx},${valueY} L${cx+rx},${startY} A${rx},${ry} 0 0 1 ${cx-rx},${startY} Z`
        : `M${cx-rx},${topY} A${rx},${ry} 0 0 1 ${cx+rx},${topY} L${cx+rx},${bottomY} A${rx},${ry} 0 0 1 ${cx-rx},${bottomY} Z`;
      faces=[svgEl('path',{d,fill:`url(#${patternId})`,class:'bar-face'})];
      const shading=svgEl('path',{d,fill:'url(#round-shade)','pointer-events':'none'});
      surfaces.appendChild(faces[0]);surfaces.appendChild(shading);
      if(shape==='cylinder') {
        // A negative cylinder's visible upper end is the zero/stack-start side.
        // Keep the lower value-side end hidden, but draw this upper cap so the
        // cylinder is finished in the same way as a positive cylinder.
        const capY=negative ? startY : valueY;
        const cap=svgEl('ellipse',{cx,cy:capY,rx,ry,fill:shade(surfaceColor,28),'fill-opacity':negative ? .55 : 1,class:'bar-face','data-cylinder-cap':'true','data-negative-zero-cap':negative ? 'true' : 'false'});
        faces.push(cap);surfaces.appendChild(cap);
      }
      surfaces.setAttribute('data-shape',shape);
    } else surfaces.append(...faces);
    if (referenceMatch && (referenceStyle === 'outline' || referenceStyle === 'glow')) {
      const referenceColor = setting('reference-color');
      const referenceWidth = Math.max(1, Math.min(8, Number(setting('reference-width')) || 3));
      for (const face of faces) {
        face.style.stroke = referenceColor;
        face.style.strokeWidth = String(referenceWidth);
        face.setAttribute('data-reference-match', 'true');
      }
      if (referenceStyle === 'glow') surfaces.style.filter = `drop-shadow(0 0 ${Math.max(2, referenceWidth)}px ${referenceColor})`;
    }
    group.appendChild(surfaces);
    if (b.showValue) {
      const inside = b.height >= 42 && !['cone','sphere','snack'].includes(shape);
      const radiusOffset = shape === 'sphere' ? Math.max(10, b.width * .34) + 5 : 9;
      const labelY = inside ? valueY + (negative ? -8 : 16) : valueY + (negative ? radiusOffset + 5 : -radiusOffset);
      group.appendChild(textEl(b.x + b.width / 2, labelY, compactNumber(b.row.value), inside ? 'value-label value-label-inside' : 'value-label', 'middle'));
    }
    if (b.stackTotalLabel) group.appendChild(textEl(b.x + b.width / 2, valueY + (negative ? 18 : -10), 'Total ' + b.stackTotalLabel, 'value-label stack-total-label', 'middle'));
    const tooltipText = formatTooltip(b.row, b.model || lastModel);
    for (const face of faces) {
      face.addEventListener('pointerenter', event => showTooltip(event, tooltipText));
      face.addEventListener('pointermove', moveTooltip);
      face.addEventListener('pointerleave', hideTooltip);
    }
    svg.appendChild(group);
  }

  function drawLegend (svg, colorKeys, title, x, y) {
    const visibleKeys = colorKeys.slice(0, 10);
    const rowHeight = 20;
    const legendWidth = 138;
    const legendHeight = 31 + visibleKeys.length * rowHeight + (colorKeys.length > visibleKeys.length ? 18 : 0);
    const g = svgEl('g', { class: 'legend' });
    g.appendChild(svgEl('rect', { x: x - 10, y: y - 18, width: legendWidth, height: legendHeight, rx: 7, class: 'legend-bg' }));
    g.appendChild(textEl(x, y, truncate(title, 18), 'legend-title', 'start'));
    visibleKeys.forEach((key, index) => {
      const rowY = y + 13 + index * rowHeight;
      const entry = svgEl('g', { class: 'legend-item', tabindex: 0, role: 'button', 'aria-label': key, 'aria-pressed': String(highlighted === key) });
      entry.appendChild(svgEl('rect', { x: x - 3, y: rowY - 2, width: 125, height: 18, fill: highlighted === key ? '#d8eaf5' : 'transparent', rx: 3 }));
      entry.appendChild(svgEl('rect', { x, y: rowY, width: 13, height: 13, rx: 2, fill: `url(#p-${document.getElementById('pattern').value}-${index})`, class: 'legend-swatch' }));
      entry.appendChild(textEl(x + 20, rowY + 11, truncate(key, 15), 'legend-label', 'start'));
      const select = () => { highlighted = highlighted === key ? null : key; render(lastModel); };
      entry.addEventListener('click', select);
      entry.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
      g.appendChild(entry);
    });
    if (colorKeys.length > visibleKeys.length) g.appendChild(textEl(x, y + 18 + visibleKeys.length * rowHeight, `+${colorKeys.length - visibleKeys.length} more`, 'legend-more', 'start'));
    svg.appendChild(g);
  }

  function buildFilters () {
    const root = document.getElementById('filter-options');
    root.replaceChildren();
    for (const [key, title] of [['category', lastModel.categoryLabel], ['depth', lastModel.depthLabel], ['color', lastModel.colorLabel]]) {
      if (!title) continue;
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = title + ' (' + key + ')';
      fieldset.appendChild(legend);
      const values = unique(lastModel.rows.map(row => row[key]));
      for (const value of values) {
        const label = document.createElement('label');
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = !filters[key] || filters[key].has(value);
        const caption = document.createElement('span');
        caption.textContent = value;
        check.addEventListener('change', () => {
          if (!filters[key]) filters[key] = new Set(values);
          if (check.checked) filters[key].add(value); else filters[key].delete(value);
          render(lastModel);
        });
        label.append(check, caption);
        fieldset.appendChild(label);
      }
      root.appendChild(fieldset);
    }
  }

  function makeDefs (colorKeys) {
    const defs = svgEl('defs');
    const gradient=svgEl('linearGradient',{id:'round-shade'});
    for(const [offset,color,opacity] of [['0%','#000',0.28],['35%','#fff',0.18],['100%','#000',0.35]])gradient.appendChild(svgEl('stop',{offset,'stop-color':color,'stop-opacity':opacity}));
    defs.appendChild(gradient);
    const sphereShade=svgEl('radialGradient',{id:'sphere-shade',cx:'32%',cy:'25%',r:'70%'});
    for(const [offset,color,opacity] of [['0%','#fff',.72],['42%','#fff',.08],['78%','#000',.08],['100%','#000',.52]])sphereShade.appendChild(svgEl('stop',{offset,'stop-color':color,'stop-opacity':opacity}));
    defs.appendChild(sphereShade);
    // One reusable transparent pattern keeps Crunch inexpensive: each mark
    // adds only one overlay path rather than dozens of individual particles.
    const crunchPattern=svgEl('pattern',{id:'snack-crunch',width:12,height:12,patternUnits:'userSpaceOnUse'});
    crunchPattern.append(
      svgEl('circle',{cx:3,cy:3,r:1.6,fill:'#fff','fill-opacity':.48}),
      svgEl('circle',{cx:8.5,cy:7,r:2.1,fill:'#1f0d08','fill-opacity':.52}),
      svgEl('circle',{cx:2,cy:10,r:1.1,fill:'#2b120b','fill-opacity':.42})
    );
    defs.appendChild(crunchPattern);
    const modes = ['solid', 'stripes', 'dots', 'mesh'];
    for (let index = -1; index < Math.max(1, colorKeys.length); index++) {
      const base = paletteColor(index);
      const light = mixWithWhite(base, Number(setting('reference-lighten')) || 55);
      for (const [variant, color] of [['', base], ['light-', light]]) {
        for (const mode of modes) {
          const pattern = svgEl('pattern', { id: `p-${mode}-${variant}${index}`, width: 10, height: 10, patternUnits: 'userSpaceOnUse' });
          pattern.appendChild(svgEl('rect', { width: 10, height: 10, fill: color }));
          if (mode === 'stripes') pattern.appendChild(svgEl('path', { d: 'M-2,2 L2,-2 M0,10 L10,0 M8,12 L12,8', stroke: shade(color, 50), 'stroke-width': 2.2, opacity: .78 }));
          if (mode === 'dots') pattern.appendChild(svgEl('circle', { cx: 3, cy: 3, r: 1.7, fill: shade(color, 55), opacity: .9 }));
          if (mode === 'mesh') pattern.appendChild(svgEl('path', { d: 'M0,0 L10,10 M10,0 L0,10', stroke: shade(color, 45), 'stroke-width': 1, opacity: .72 }));
          defs.appendChild(pattern);
        }
      }
    }
    return defs;
  }

  function paletteColor (index) {
    if (index === -1) return document.getElementById('reference-color').value;
    const name = document.getElementById('palette').value;
    const colors = palettes[name] || palettes.tableau;
    return colors[index % colors.length];
  }

  function shade (hex, amount) {
    const number = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (number >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((number >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (number & 255) + amount));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  function mixWithWhite (hex, percent) {
    const number = parseInt(hex.slice(1), 16);
    const ratio = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
    const channel = shift => Math.round(((number >> shift) & 255) + (255 - ((number >> shift) & 255)) * ratio);
    const r = channel(16), g = channel(8), b = channel(0);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  function svgEl (name, attrs = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  }

  function textEl (x, y, value, className, anchor) {
    const node = svgEl('text', { x, y, class: className, 'text-anchor': anchor });
    node.textContent = value;
    return node;
  }

  function points (values) { return values.map(value => value.join(',')).join(' '); }
  function unique (values) { return [...new Set(values)]; }
  function truncate (value, length) { return value.length > length ? value.slice(0, length - 1) + '…' : value; }
  function compactNumber (value) { return new Intl.NumberFormat('ja-JP', { notation: Math.abs(value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value); }
  function formatTooltip (row, model) {
    const lines = [
      [model.categoryLabel || 'X', row.category],
      [model.valueLabel || 'Y', row.valueText || compactNumber(row.value)]
    ];
    if (Number.isFinite(row._stackTotal) && row._stackTotal !== row.value) lines.push(['Stack total', compactNumber(row._stackTotal)]);
    if (model.rawValueLabel && model.rawValueLabel !== model.valueLabel) lines.push([`Original value (${model.rawValueLabel})`, row.rawValueText || compactNumber(row.rawValue)]);
    if (model.depthLabel && row.depth !== 'All') lines.push([model.depthLabel, row.depth]);
    if (model.pageLabel && row.pageText) lines.push([model.pageLabel, row.pageText]);
    for (const name of model.extraFieldNames || []) {
      const value = row.extraColors?.[name] ?? (Number.isFinite(Number(row.extraNumbers?.[name])) ? compactNumber(Number(row.extraNumbers[name])) : '(Null)');
      lines.push([name, value]);
    }
    return lines.map(([name, value]) => `${name}: ${value}`).join('\n');
  }
  function setStatus (value) { document.getElementById('status').textContent = value; }

  function showEmpty (title, note = 'Configure Category and Value to display the chart here.') {
    const chart = document.getElementById('chart');
    const width = Math.max(420, chart.clientWidth || 900);
    const height = Math.max(300, chart.clientHeight || 540);
    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}` });
    svg.appendChild(textEl(width / 2, height / 2 - 12, title, 'empty-title', 'middle'));
    svg.appendChild(textEl(width / 2, height / 2 + 18, note, 'empty-note', 'middle'));
    chart.replaceChildren(svg);
  }

  function showMessage (text) { const node = document.getElementById('message'); node.textContent = text; node.hidden = false; }
  function hideMessage () { document.getElementById('message').hidden = true; }
  function showTooltip (event, text) { const node = document.getElementById('tooltip'); node.textContent = text; node.hidden = false; moveTooltip(event); }
  function moveTooltip (event) { const node = document.getElementById('tooltip'); node.style.left = `${event.clientX + 13}px`; node.style.top = `${event.clientY + 13}px`; }
  function hideTooltip () { document.getElementById('tooltip').hidden = true; }
})();
